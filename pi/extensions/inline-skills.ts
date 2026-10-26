import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ExtensionAPI, SlashCommandInfo } from "@earendil-works/pi-coding-agent";
import type { AutocompleteProvider } from "@earendil-works/pi-tui";

// Built-in command names in the pinned Pi runtime are not included in getCommands().
const builtins = new Set("settings model tree thinking scoped-models export import share bug copy name session changelog hotkeys fork clone trust login logout new compact resume reload quit".split(" "));

export function skillAliases(commands: SlashCommandInfo[]) {
	const reserved = new Set([...builtins, ...commands.filter(c => c.source !== "skill").map(c => c.name)]);
	return commands.filter(c => c.source === "skill" && c.name.startsWith("skill:") && !reserved.has(c.name.slice(6)))
		.map(c => ({ ...c, name: c.name.slice(6) }));
}

// Ignore Markdown examples, escaped slashes, URLs and paths. Only standalone mentions count.
function prose(text: string) {
	return text.replace(/(^[ \t]*(`{3,}|~{3,})[^\n]*\n)[\s\S]*?(?:^[ \t]*\2[ \t]*$|(?![\s\S]))|(`+)[\s\S]*?(?:\3|(?![\s\S]))/gm,
		match => match.replace(/[^\n]/g, " "));
}

function skillToken(lines: string[], row: number, col: number) {
	const before = prose(lines.slice(0, row).join("\n") + (row ? "\n" : "") + lines[row].slice(0, col));
	return before.match(/(?:^|\s)\/([a-z0-9-]*)$/)?.[1];
}

export function createInlineEditor(Base: typeof import("@earendil-works/pi-coding-agent").CustomEditor, getCommands: () => SlashCommandInfo[]) {
	return class InlineSkillEditor extends Base {
		handleInput(data: string) {
			const previous = this.getText();
			super.handleInput(data);
			if (previous === this.getText()) return;
			const { line, col } = this.getCursor();
			const token = skillToken(this.getLines(), line, col);
			if (token === undefined || !skillAliases(getCommands()).some(c => c.name.startsWith(token))) return;
			// Pi 1.4.0 excludes '/' from provider triggerCharacters. Keep this private-API
			// bridge isolated: a regular request opens Pi's own menu without auto-accepting.
			const bridge = this as unknown as { requestAutocomplete?: (options: { force: boolean; explicitTab: boolean }) => void };
			bridge.requestAutocomplete?.({ force: false, explicitTab: false });
		}
	};
}

export function createSkillProvider(current: AutocompleteProvider, getCommands: () => SlashCommandInfo[]): AutocompleteProvider {
	return {
		triggerCharacters: [...new Set([...(current.triggerCharacters ?? []), "/"])],
		async getSuggestions(lines, row, col, options) {
			const token = skillToken(lines, row, col);
			if (token === undefined || options.signal.aborted) return current.getSuggestions(lines, row, col, options);
			const items = skillAliases(getCommands()).filter(c => c.name.startsWith(token))
				.map(c => ({ value: `/${c.name}`, label: `/${c.name}`, description: c.description }));
			const base = await current.getSuggestions(lines, row, col, options);
			if (!items.length) return base;
			// At line start keep commands (and /skill:name) in the same menu.
			const atStart = lines[row].slice(0, col - token.length - 1).trim() === "";
			const combined = atStart && base ? [...items, ...base.items] : items;
			return { items: combined, prefix: `/${token}` };
		},
		applyCompletion(lines, row, col, item, prefix) {
			if (!skillAliases(getCommands()).some(c => item.value === `/${c.name}`)) {
				return current.applyCompletion(lines, row, col, item, prefix);
			}
			const result = [...lines];
			const after = lines[row].slice(col);
			const replacement = item.value + (after.startsWith(" ") ? "" : " ");
			result[row] = lines[row].slice(0, col - prefix.length) + replacement + after;
			return { lines: result, cursorLine: row, cursorCol: col - prefix.length + replacement.length };
		},
		shouldTriggerFileCompletion: (lines, row, col) => current.shouldTriggerFileCompletion?.(lines, row, col) ?? true,
	};
}

export async function expandSkillMentions(text: string, commands: SlashCommandInfo[]) {
	// Leave native command/template argument processing to Pi.
	const leading = text.match(/^\/([^\s]+)/)?.[1];
	if (leading && (builtins.has(leading) || commands.some(c => c.name === leading))) return text;
	const available = new Map(skillAliases(commands).map(c => [c.name, c]));
	const names = [...prose(text).matchAll(/(?:^|\s)\/([a-z0-9]+(?:-[a-z0-9]+)*)(?=$|\s|[.,!?;:)])/g)]
		.map(match => match[1]).filter(name => available.has(name));
	const blocks = await Promise.all([...new Set(names)].map(async name => {
		const command = available.get(name)!;
		const path = command.sourceInfo.path;
		const content = await readFile(path, "utf8");
		const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "").trim();
		const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
		return `<skill name="${escape(name)}" location="${escape(path)}">\nReferences are relative to ${dirname(path)}.\n\n${body}\n</skill>`;
	}));
	// Preserve the exact request, including explicit pair options following /pair.
	return blocks.length ? `${blocks.join("\n\n")}\n\n${text}` : text;
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		const { CustomEditor } = await import("@earendil-works/pi-coding-agent");
		const InlineEditor = createInlineEditor(CustomEditor, () => pi.getCommands());
		ctx.ui.setEditorComponent((tui, theme, keybindings) => new InlineEditor(tui, theme, keybindings));
		ctx.ui.addAutocompleteProvider(current => createSkillProvider(current, () => pi.getCommands()));
	});
	pi.on("input", async (event, ctx) => {
		if (event.source !== "interactive") return { action: "continue" as const };
		try {
			const text = await expandSkillMentions(event.text, pi.getCommands());
			return text === event.text ? { action: "continue" as const } : { action: "transform" as const, text };
		} catch (error) {
			ctx.ui.notify(`Could not load mentioned skill: ${error instanceof Error ? error.message : error}`, "error");
			// Do not silently submit a request without its explicitly requested instructions.
			ctx.ui.setEditorText(event.text);
			return { action: "handled" as const };
		}
	});
}
