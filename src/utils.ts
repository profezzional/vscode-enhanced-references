import * as vscode from "vscode";

export const deleteFromArray = <T>(array: T[], element: T): void => {
  const elementIndex: number = array.indexOf(element);

  if (elementIndex >= 0) {
    array.splice(elementIndex, 1);
  }
};

export const tail = <T>(array: T[]): T | undefined => {
  return array[array.length - 1];
};

export const asResourceUrl = (
  uri: vscode.Uri,
  range: vscode.Range,
): vscode.Uri => {
  return uri.with({
    fragment: `L${range.start.line + 1},${range.start.character + 1}-${range.end.line + 1},${range.end.character + 1}`,
  });
};

export const isValidRequestPosition = async (
  uri: vscode.Uri,
  position: vscode.Position,
): Promise<boolean> => {
  const document: vscode.TextDocument =
    await vscode.workspace.openTextDocument(uri);
  let range: vscode.Range | undefined =
    document.getWordRangeAtPosition(position);

  if (!range) {
    range = document.getWordRangeAtPosition(position, /[^\s]+/);
  }

  return Boolean(range);
};

export type Preview = {
  before: string;
  inside: string;
  after: string;
};

export const getPreviewChunks = (
  document: vscode.TextDocument,
  range: vscode.Range,
  numPrefixChars: number = 8,
  trim: boolean = true,
): Preview => {
  const previewStartPosition: vscode.Position = range.start.with({
    character: Math.max(0, range.start.character - numPrefixChars),
  });
  const wordRange: vscode.Range | undefined =
    document.getWordRangeAtPosition(previewStartPosition);

  let before = document.getText(
    new vscode.Range(wordRange?.start || previewStartPosition, range.start),
  );

  const inside: string = document.getText(range);
  const previewEndPosition: vscode.Position = range.end.translate(0, 331);
  let after: string = document.getText(
    new vscode.Range(range.end, previewEndPosition),
  );

  if (trim) {
    before = before.replace(/^\s*/g, "");
    after = after.replace(/\s*$/g, "");
  }

  return { before, inside, after };
};

export class ContextKey<V> {
  public constructor(readonly name: string) {}

  public async set(value: V): Promise<void> {
    await vscode.commands.executeCommand("setContext", this.name, value);
  }

  public async reset(): Promise<void> {
    await vscode.commands.executeCommand("setContext", this.name, undefined);
  }
}

export class WordAnchor {
  private readonly version: number;
  private readonly word: string | undefined;

  public constructor(
    private readonly document: vscode.TextDocument,
    private readonly position: vscode.Position,
  ) {
    this.version = document.version;
    this.word = this.getAnchorWord(document, position);
  }

  private getAnchorWord(
    doc: vscode.TextDocument,
    pos: vscode.Position,
  ): string | undefined {
    const range: vscode.Range | undefined =
      doc.getWordRangeAtPosition(pos) ||
      doc.getWordRangeAtPosition(pos, /[^\s]+/);

    return range && doc.getText(range);
  }

  public guessedTrackedPosition(): vscode.Position | undefined {
    // funky entry
    if (!this.word) {
      return this.position;
    }

    // no changes
    if (this.version === this.document.version) {
      return this.position;
    }

    // no changes here...
    const anchorWord: string | undefined = this.getAnchorWord(
      this.document,
      this.position,
    );

    if (this.word === anchorWord) {
      return this.position;
    }

    // changes: search _word downwards and upwards
    const startLine: number = this.position.line;
    let i: number = 0;
    let lineNumber: number;
    let checked: boolean;

    do {
      checked = false;
      // nth line down
      lineNumber = startLine + i;

      if (lineNumber < this.document.lineCount) {
        checked = true;
        const ch = this.document.lineAt(lineNumber).text.indexOf(this.word);
        if (ch >= 0) {
          return new vscode.Position(lineNumber, ch);
        }
      }

      i += 1;

      // nth line up
      lineNumber = startLine - i;

      if (lineNumber >= 0) {
        checked = true;
        const wordIndex: number = this.document
          .lineAt(lineNumber)
          .text.indexOf(this.word);

        if (wordIndex >= 0) {
          return new vscode.Position(lineNumber, wordIndex);
        }
      }
    } while (i < 100 && checked);

    // fallback
    return this.position;
  }
}

// vscode.SymbolKind.File === 0, Module === 1, etc...
const THEME_ICON_IDS: string[] = [
  "symbol-file",
  "symbol-module",
  "symbol-namespace",
  "symbol-package",
  "symbol-class",
  "symbol-method",
  "symbol-property",
  "symbol-field",
  "symbol-constructor",
  "symbol-enum",
  "symbol-interface",
  "symbol-function",
  "symbol-variable",
  "symbol-constant",
  "symbol-string",
  "symbol-number",
  "symbol-boolean",
  "symbol-array",
  "symbol-object",
  "symbol-key",
  "symbol-null",
  "symbol-enum-member",
  "symbol-struct",
  "symbol-event",
  "symbol-operator",
  "symbol-type-parameter",
];

export const getThemeIcon = (
  kind: vscode.SymbolKind,
): vscode.ThemeIcon | undefined => {
  const themeIconID: string = THEME_ICON_IDS[kind];
  return themeIconID ? new vscode.ThemeIcon(themeIconID) : undefined;
};

export const getLengthOfCommonPrefix = (a: string, b: string): number => {
  let currentIndex: number = 0;

  while (
    currentIndex < a.length &&
    currentIndex < b.length &&
    a.charCodeAt(currentIndex) === b.charCodeAt(currentIndex)
  ) {
    currentIndex += 1;
  }

  return currentIndex;
};

export const compareUriIgnoreFragment = (
  a: vscode.Uri,
  b: vscode.Uri,
): number => {
  const aString: string = a.with({ fragment: "" }).toString();
  const bString: string = b.with({ fragment: "" }).toString();

  if (aString < bString) {
    return -1;
  }

  if (aString > bString) {
    return 1;
  }

  return 0;
};

export const compareLocations = (
  a: vscode.Location | vscode.LocationLink,
  b: vscode.Location | vscode.LocationLink,
): number => {
  const aURI: vscode.Uri = a instanceof vscode.Location ? a.uri : a.targetUri;
  const bURI: vscode.Uri = b instanceof vscode.Location ? b.uri : b.targetUri;

  if (aURI.toString() < bURI.toString()) {
    return -1;
  }

  if (aURI.toString() > bURI.toString()) {
    return 1;
  }

  const aRange: vscode.Range =
    a instanceof vscode.Location ? a.range : a.targetRange;
  const bRange: vscode.Range =
    b instanceof vscode.Location ? b.range : b.targetRange;

  if (aRange.start.isBefore(bRange.start)) {
    return -1;
  }

  if (aRange.start.isAfter(bRange.start)) {
    return 1;
  }

  return 0;
};
