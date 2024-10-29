import * as vscode from "vscode";
import * as calls from "./calls";
import { SymbolsTree, SymbolsTreeInput } from "./enhanced-references";
import * as references from "./references";
import { FileItem, ReferenceItem } from "./references/model";
import * as types from "./types";

export const activate = (context: vscode.ExtensionContext): SymbolsTree => {
  const tree: SymbolsTree<FileItem | ReferenceItem> = new SymbolsTree<
    FileItem | ReferenceItem
  >();

  references.registerCommands(tree, context);
  calls.register(tree, context);
  types.register(tree, context);

  const setInput = (
    input: SymbolsTreeInput<FileItem | ReferenceItem>,
  ): void => {
    tree.setInput(input);
  };

  const getInput = ():
    | SymbolsTreeInput<FileItem | ReferenceItem>
    | undefined => {
    return tree.getInput();
  };

  return { setInput, getInput };
};
