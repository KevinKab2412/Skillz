//! Pi RPC framing: one JSON object per LF-terminated record.
//!
//! Records are split only on `\n` (an optional `\r` before it is stripped). Unicode line and
//! paragraph separators (U+2028/U+2029) are valid inside JSON strings and must not split a record.

use serde_json::Value;

#[derive(Default)]
pub struct RecordSplitter {
    buf: Vec<u8>,
}

impl RecordSplitter {
    /// Feeds raw stdout bytes and returns every complete record they finish.
    pub fn push(&mut self, bytes: &[u8]) -> Vec<Result<Value, String>> {
        self.buf.extend_from_slice(bytes);
        let mut out = vec![];
        while let Some(i) = self.buf.iter().position(|&b| b == b'\n') {
            let mut line: Vec<u8> = self.buf.drain(..=i).collect();
            line.pop();
            if line.last() == Some(&b'\r') {
                line.pop();
            }
            if line.iter().all(|b| b.is_ascii_whitespace()) {
                continue;
            }
            out.push(serde_json::from_slice(&line).map_err(|e| {
                format!("bad record ({e}): {}", String::from_utf8_lossy(&line))
            }));
        }
        out
    }
}

/// Serialises one command as a single LF-terminated record.
pub fn encode(cmd: &Value) -> Vec<u8> {
    let mut bytes = serde_json::to_vec(cmd).expect("serde_json::Value always serialises");
    bytes.push(b'\n');
    bytes
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn splits_on_lf_across_chunks_and_strips_cr() {
        let mut s = RecordSplitter::default();
        assert!(s.push(b"{\"type\":\"a\"}\r\n{\"ty").iter().map(|r| r.as_ref().unwrap()["type"].clone()).eq([json!("a")]));
        let rest = s.push(b"pe\":\"b\"}\n\n");
        assert_eq!(rest.len(), 1);
        assert_eq!(rest[0].as_ref().unwrap()["type"], "b");
    }

    #[test]
    fn unicode_separators_stay_inside_a_record() {
        let mut s = RecordSplitter::default();
        let rec = json!({"type": "message_update", "delta": "a\u{2028}b\u{2029}c"});
        let out = s.push(&encode(&rec));
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].as_ref().unwrap(), &rec);
    }

    #[test]
    fn bad_json_is_reported_not_fatal() {
        let mut s = RecordSplitter::default();
        let out = s.push(b"not json\n{\"ok\":1}\n");
        assert!(out[0].is_err());
        assert_eq!(out[1].as_ref().unwrap()["ok"], 1);
    }
}
