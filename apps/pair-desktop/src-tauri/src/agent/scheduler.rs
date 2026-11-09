//! Decides when an agent task may start.
//!
//! One task per note at a time, and at most `limit` notes running at once. Anything else
//! waits in arrival order. Pure logic, so the rules are testable without processes.

use std::collections::{HashSet, VecDeque};

pub type NoteKey = String;

#[derive(Debug, Clone, PartialEq)]
pub struct Task {
    pub key: NoteKey,
    pub message: String,
}

pub struct Scheduler {
    limit: usize,
    running: HashSet<NoteKey>,
    queue: VecDeque<Task>,
}

impl Scheduler {
    pub fn new(limit: usize) -> Self {
        Scheduler { limit, running: HashSet::new(), queue: VecDeque::new() }
    }

    /// Returns the task back if it can start now; otherwise it is queued.
    pub fn submit(&mut self, task: Task) -> Option<Task> {
        if self.can_start(&task.key) {
            self.running.insert(task.key.clone());
            Some(task)
        } else {
            self.queue.push_back(task);
            None
        }
    }

    /// Marks a note's task finished and returns every queued task that may now start.
    pub fn settled(&mut self, key: &str) -> Vec<Task> {
        self.running.remove(key);
        let mut started = vec![];
        let mut i = 0;
        while i < self.queue.len() {
            if self.can_start(&self.queue[i].key) {
                let t = self.queue.remove(i).expect("index checked");
                self.running.insert(t.key.clone());
                started.push(t);
            } else {
                i += 1;
            }
        }
        started
    }

    /// Drops a note's queued tasks (Stop, or the note closed). Does not touch a running one.
    pub fn cancel_queued(&mut self, key: &str) -> usize {
        let before = self.queue.len();
        self.queue.retain(|t| t.key != key);
        before - self.queue.len()
    }

    pub fn is_running(&self, key: &str) -> bool {
        self.running.contains(key)
    }

    pub fn queued(&self, key: &str) -> usize {
        self.queue.iter().filter(|t| t.key == key).count()
    }

    fn can_start(&self, key: &str) -> bool {
        !self.running.contains(key) && self.running.len() < self.limit
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn t(key: &str, m: &str) -> Task {
        Task { key: key.into(), message: m.into() }
    }

    #[test]
    fn caps_running_notes_at_the_limit() {
        let mut s = Scheduler::new(3);
        assert!(s.submit(t("a", "1")).is_some());
        assert!(s.submit(t("b", "1")).is_some());
        assert!(s.submit(t("c", "1")).is_some());
        assert!(s.submit(t("d", "1")).is_none());
        assert_eq!(s.queued("d"), 1);
        assert_eq!(s.settled("b"), vec![t("d", "1")]);
        assert!(s.is_running("d") && !s.is_running("b"));
    }

    #[test]
    fn one_task_per_note_in_order() {
        let mut s = Scheduler::new(3);
        assert!(s.submit(t("a", "1")).is_some());
        assert!(s.submit(t("a", "2")).is_none());
        assert!(s.submit(t("a", "3")).is_none());
        assert_eq!(s.settled("a"), vec![t("a", "2")]);
        assert_eq!(s.settled("a"), vec![t("a", "3")]);
        assert!(s.settled("a").is_empty());
    }

    #[test]
    fn a_blocked_note_does_not_hold_up_others() {
        let mut s = Scheduler::new(2);
        s.submit(t("a", "1"));
        s.submit(t("b", "1"));
        s.submit(t("a", "2"));
        s.submit(t("c", "1"));
        // b settles: a is still running, so c (behind a's queued task) starts.
        assert_eq!(s.settled("b"), vec![t("c", "1")]);
    }

    #[test]
    fn cancel_queued_drops_only_that_note() {
        let mut s = Scheduler::new(1);
        s.submit(t("a", "1"));
        s.submit(t("a", "2"));
        s.submit(t("b", "1"));
        assert_eq!(s.cancel_queued("a"), 1);
        assert_eq!(s.settled("a"), vec![t("b", "1")]);
    }
}
