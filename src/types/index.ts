import * as vscode from "vscode";
import { SymbolsTreeInput } from "../enhanced-references";
import { SymbolsTree } from "../tree";
import { ContextKey } from "../utils";
import { TypeHierarchyDirection, TypeItem, TypesTreeInput } from "./model";

export const register = <T>(
  tree: SymbolsTree<T>,
  context: vscode.ExtensionContext,
): void => {
  const direction: RichTypesDirection = new RichTypesDirection(
    context.workspaceState,
    TypeHierarchyDirection.Subtypes,
  );

  const showTypeHierarchy = (): void => {
    if (!vscode.window.activeTextEditor) {
      return;
    }

    const input: TypesTreeInput = new TypesTreeInput(
      new vscode.Location(
        vscode.window.activeTextEditor.document.uri,
        vscode.window.activeTextEditor.selection.active,
      ),
      direction.value,
    );

    tree.setInput(input);
  };

  const setTypeHierarchyDirection = <T>(
    value: TypeHierarchyDirection,
    anchor: TypeItem | vscode.Location | unknown,
  ): void => {
    direction.value = value;

    let newInput: TypesTreeInput | undefined;
    const oldInput: SymbolsTreeInput<T> | undefined = tree.getInput();

    if (anchor instanceof TypeItem) {
      newInput = new TypesTreeInput(
        new vscode.Location(anchor.item.uri, anchor.item.selectionRange.start),
        direction.value,
      );
    } else if (anchor instanceof vscode.Location) {
      newInput = new TypesTreeInput(anchor, direction.value);
    } else if (oldInput instanceof TypesTreeInput) {
      newInput = new TypesTreeInput(oldInput.location, direction.value);
    }

    if (newInput) {
      tree.setInput(newInput);
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "enhanced-references.showTypeHierarchy",
      showTypeHierarchy,
    ),
    vscode.commands.registerCommand(
      "enhanced-references.showSupertypes",
      (item: TypeItem | vscode.Location | unknown) =>
        setTypeHierarchyDirection(TypeHierarchyDirection.Supertypes, item),
    ),
    vscode.commands.registerCommand(
      "enhanced-references.showSubtypes",
      (item: TypeItem | vscode.Location | unknown) =>
        setTypeHierarchyDirection(TypeHierarchyDirection.Subtypes, item),
    ),
    vscode.commands.registerCommand(
      "enhanced-references.removeTypeItem",
      removeTypeItem,
    ),
  );
};

const removeTypeItem = (item: TypeItem | unknown): void => {
  if (item instanceof TypeItem) {
    item.remove();
  }
};

class RichTypesDirection {
  private static key: string = "enhanced-references.typeHierarchyMode";

  private typeHierarchyMode = new ContextKey<TypeHierarchyDirection>(
    "enhanced-references.typeHierarchyMode",
  );

  public constructor(
    private memento: vscode.Memento,
    private typeHierarchyDirection: TypeHierarchyDirection = TypeHierarchyDirection.Subtypes,
  ) {
    const rawTypeHierarchyDirectionValue: TypeHierarchyDirection | undefined =
      memento.get<TypeHierarchyDirection>(RichTypesDirection.key);

    if (typeof rawTypeHierarchyDirectionValue === "string") {
      this.value = rawTypeHierarchyDirectionValue;
    } else {
      this.value = typeHierarchyDirection;
    }
  }

  public get value(): TypeHierarchyDirection {
    return this.typeHierarchyDirection;
  }

  public set value(value: TypeHierarchyDirection) {
    this.typeHierarchyDirection = value;
    this.typeHierarchyMode.set(value);
    this.memento.update(RichTypesDirection.key, value);
  }
}
