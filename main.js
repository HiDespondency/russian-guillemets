'use strict';

const { Plugin, Notice, MarkdownView } = require('obsidian');
const OPEN_QUOTE = '\u00AB';
const CLOSE_QUOTE = '\u00BB';
const EM_DASH = '\u2014';
const EN_DASH = '\u2013';

class RussianGuillemetsPlugin extends Plugin {
	onload() {
		const keydownHandler = (event) => this.handleQuoteKeydown(event);
		document.addEventListener('keydown', keydownHandler, true);
		this.register(() => document.removeEventListener('keydown', keydownHandler, true));

		const beforeInputHandler = (event) => {
			if (event.inputType !== 'insertText' || event.data !== '"') return;
			this.replaceInActiveTextField(event);
		};
		document.addEventListener('beforeinput', beforeInputHandler, true);
		this.register(() => document.removeEventListener('beforeinput', beforeInputHandler, true));

		this.addCommand({
			id: 'convert-straight-quotes',
			name: 'Convert straight quotes to guillemets',
			editorCallback: (editor) => {
				this.convertQuotesInEditor(editor);
			}
		});
	}

	handleQuoteKeydown(event) {
		if (!this.isStraightQuoteKey(event)) return;
		if (event.ctrlKey || event.metaKey || event.altKey) return;

		if (this.replaceInMarkdownEditor(event)) return;
		this.replaceInActiveTextField(event);
	}

	isStraightQuoteKey(event) {
		return event.key === '"' || event.key === 'Quote' || (event.code === 'Quote' && event.shiftKey);
	}

	replaceInMarkdownEditor(event) {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		const editor = view?.editor;
		if (!editor) return false;
		if (!view.containerEl.contains(event.target)) return false;

		const cursor = editor.getCursor();
		if (!cursor) return false;
		const line = editor.getLine(cursor.line) ?? '';
		const linePrefix = line.slice(0, cursor.ch);
		const replacement = this.chooseReplacement(linePrefix);

		event.preventDefault();
		editor.replaceRange(replacement, cursor, cursor);
		editor.setCursor({ line: cursor.line, ch: cursor.ch + 1 });
		return true;
	}

	replaceInActiveTextField(event) {
		const target = event.target;
		if (this.isEditableInput(target)) {
			this.replaceInInputLikeElement(event, target);
			return true;
		}

		const editable = target?.closest?.('[contenteditable="true"]');
		if (editable) {
			this.replaceInContentEditable(event, editable);
			return true;
		}

		return false;
	}

	isEditableInput(element) {
		if (!element) return false;
		if (element instanceof HTMLTextAreaElement) return !element.disabled && !element.readOnly;
		if (!(element instanceof HTMLInputElement)) return false;
		if (element.disabled || element.readOnly) return false;
		const type = (element.type || 'text').toLowerCase();
		return ['text', 'search', 'url', 'email', 'tel', ''].includes(type);
	}

	replaceInInputLikeElement(event, element) {
		const start = element.selectionStart ?? element.value.length;
		const end = element.selectionEnd ?? start;
		const prefix = element.value.slice(0, start);
		const replacement = this.chooseReplacement(prefix);

		event.preventDefault();
		element.setRangeText(replacement, start, end, 'end');
		element.dispatchEvent(new InputEvent('input', {
			bubbles: true,
			inputType: 'insertText',
			data: replacement
		}));
	}

	replaceInContentEditable(event, root) {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) return false;

		const range = selection.getRangeAt(0);
		if (!root.contains(range.commonAncestorContainer)) return false;

		const prefixRange = range.cloneRange();
		prefixRange.selectNodeContents(root);
		prefixRange.setEnd(range.startContainer, range.startOffset);
		const replacement = this.chooseReplacement(prefixRange.toString());

		event.preventDefault();
		range.deleteContents();
		const textNode = document.createTextNode(replacement);
		range.insertNode(textNode);
		range.setStartAfter(textNode);
		range.collapse(true);
		selection.removeAllRanges();
		selection.addRange(range);
		root.dispatchEvent(new InputEvent('input', {
			bubbles: true,
			inputType: 'insertText',
			data: replacement
		}));
		return true;
	}

	shouldUseOpeningQuote(prevChar) {
		if (!prevChar) return true;
		return /[\s([{-]/.test(prevChar) || prevChar === EM_DASH || prevChar === EN_DASH;
	}

	countUnmatchedOpeningQuotes(text) {
		let openings = 0;
		let closings = 0;

		for (const char of text) {
			if (char === OPEN_QUOTE) openings += 1;
			if (char === CLOSE_QUOTE) closings += 1;
		}

		return openings - closings;
	}

	chooseReplacement(linePrefix) {
		if (this.countUnmatchedOpeningQuotes(linePrefix) > 0) {
			return CLOSE_QUOTE;
		}

		const prevChar = linePrefix.length > 0 ? linePrefix[linePrefix.length - 1] : '';
		return this.shouldUseOpeningQuote(prevChar) ? OPEN_QUOTE : CLOSE_QUOTE;
	}

	convertQuotesInText(text) {
		const lines = text.split('\n');

		return lines.map((line) => {
			let result = '';
			for (let i = 0; i < line.length; i += 1) {
				const char = line[i];
				if (char !== '"') {
					result += char;
					continue;
				}

				result += this.chooseReplacement(result);
			}

			return result;
		}).join('\n');
	}

	convertQuotesInEditor(editor) {
		const selection = editor.getSelection();
		if (selection && selection.length > 0) {
			editor.replaceSelection(this.convertQuotesInText(selection));
			new Notice('Straight quotes converted in selection.');
			return;
		}

		editor.setValue(this.convertQuotesInText(editor.getValue()));
		new Notice('Straight quotes converted in current note.');
	}
}

module.exports = RussianGuillemetsPlugin;
