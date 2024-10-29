import * as vscode from "vscode";

/**
 * Describes the shape for the references viewlet API. It includes a single
 * {@link SymbolsTree.setInput | setInput} function, which must be called with a
 * full implementation of the {@link SymbolsTreeInput} interface. You can also
 * use the {@link SymbolsTree.getInput | getInput} function to get the current
 * {@link SymbolsTreeInput}`. To acquire this API, use the default mechanics.
 *
 * @example
 * // get references viewlet API
 * const api: SymbolTree = await vscode.extensions
 *   .getExtension<SymbolTree>('vscode.enhanced-references').activate();
 *
 * // instantiate and set input, which updates the view
 * const myInput: SymbolTreeInput<MyItems> = ...
 * api.setInput(myInput);
 * const currentInput: SymbolTreeInput<unknown> = api.getInput();
 */
export interface SymbolsTree<T> {
  /**
   * Set the contents of the references viewlet.
   *
   * @param input A symbol tree input object
   */
  setInput(input: SymbolsTreeInput<T>): void;

  /**
   * Get the contents of the references viewlet.
   *
   * @returns The current symbol tree input object
   */
  getInput<T>(): SymbolsTreeInput<T> | undefined;
}

/**
 * A symbol tree input is the entry point for populating the references viewlet.
 * Inputs must be anchored at a code location, they must have a title, and they
 * must resolve to a model.
 */
export interface SymbolsTreeInput<T> {
  /**
   * The value of the `reference-list.source` context key. Use this to control
   * input dependent commands.
   */
  readonly contextValue: string;

  /** The (short) title of this input, like "Implementations" or "Callers Of". */
  readonly title: string;

  /**
   * The location at which this position is anchored. Locations are validated,
   * and inputs with "funny" locations might be ignored.
   */
  readonly location: vscode.Location;

  /**
   * Resolve this input to a model that contains the actual data. When there are
   * no results, then `undefined` or `null` should be returned.
   */
  resolve(): vscode.ProviderResult<SymbolsTreeModel<T>>;

  /**
   * This function is called when re-running from history. The symbols tree
   * has tracked the original location of this input and that is now passed to
   * this input. The implementation of this function should return a clone
   * where the {@link SymbolsTreeInput.location | location} property uses the
   * provided {@link location}.
   *
   * @param location The location at which the new input should be anchored.
   * @returns A new input which location is anchored at the position.
   */
  with(location: vscode.Location): SymbolsTreeInput<T>;
}

/** A symbol tree model, used to populate the symbols tree. */
export interface SymbolsTreeModel<T> {
  /** A tree data provider which is used to populate the symbols tree. */
  provider: vscode.TreeDataProvider<T>;

  /**
   * An optional message that is displayed above the tree. Whenever the
   * provider fires a change event, this message is read again.
   */
  message: string | undefined;

  /**
   * Optional support for symbol navigation. When implemented, navigation
   * commands like "Go to Next" and "Go to Previous" will be working with this
   * model.
   */
  navigation?: SymbolItemNavigation<T>;

  /**
   * Optional support for editor highlights. When implemented, the editor will
   * highlight symbol ranges in the source code.
   */
  highlights?: SymbolItemEditorHighlights<T>;

  /** Optional support for drag and drop. */
  dragAndDrop?: SymbolItemDragAndDrop<T>;

  /** Optional dispose function, invoked when the model is no longer needed. */
  dispose?(): void;
}

/** Interface to support the built-in symbol navigation. */
export interface SymbolItemNavigation<T> {
  /** Return the item that is the nearest to the given location, or `undefined`. */
  nearest(uri: vscode.Uri, position: vscode.Position): T | undefined;
  /** Return the next item from the given item, or the item itself. */
  next(from: T): T;
  /** Return the previous item from the given item, or the item itself. */
  previous(from: T): T;
  /** Return the location of the given item. */
  location(item: T): vscode.Location | undefined;
}

/**
 * Interface to support the built-in editor highlights.
 */
export interface SymbolItemEditorHighlights<T> {
  /** Given an item and an uri, return an array of ranges to highlight. */
  getEditorHighlights(item: T, uri: vscode.Uri): vscode.Range[] | undefined;
}

export interface SymbolItemDragAndDrop<T> {
  getDragURI(item: T): vscode.Uri | undefined;
}
