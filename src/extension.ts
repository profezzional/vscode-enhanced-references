import * as vscode from "vscode";
import * as calls from "./calls";
import { SymbolTree, SymbolTreeInput } from "./enhanced-references";
import * as references from "./references";
import { SymbolsTree } from "./tree";
import * as types from "./types";

export function activate(context: vscode.ExtensionContext): SymbolTree {
  const tree = new SymbolsTree();

  references.register(tree, context);
  calls.register(tree, context);
  types.register(tree, context);

  function setInput(input: SymbolTreeInput<unknown>) {
    tree.setInput(input);
  }

  function getInput(): SymbolTreeInput<unknown> | undefined {
    return tree.getInput();
  }

  return { setInput, getInput };
}
