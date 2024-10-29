import * as vscode from "vscode";
import { SymbolsTreeInput } from "../enhanced-references";
import { SymbolsTree } from "../tree";
import { ContextKey } from "../utils";
import { CallItem, CallsDirection, CallsTreeInput } from "./model";

export const register = <T>(
  tree: SymbolsTree<T>,
  context: vscode.ExtensionContext,
): void => {
  const direction: RichCallsDirection = new RichCallsDirection(
    context.workspaceState,
    CallsDirection.Incoming,
  );

  const showCallHierarchy = (): void => {
    if (!vscode.window.activeTextEditor) {
      return;
    }

    const input: CallsTreeInput = new CallsTreeInput(
      new vscode.Location(
        vscode.window.activeTextEditor.document.uri,
        vscode.window.activeTextEditor.selection.active,
      ),
      direction.value,
    );

    tree.setInput(input);
  };

  const removeCallItem = (item: CallItem | unknown): void => {
    if (item instanceof CallItem) {
      item.remove();
    }
  };

  const setCallsDirection = (
    value: CallsDirection,
    anchor: CallItem | unknown,
  ): void => {
    direction.value = value;

    let newInput: CallsTreeInput | undefined;
    const oldInput: SymbolsTreeInput<T> | undefined = tree.getInput();

    if (anchor instanceof CallItem) {
      newInput = new CallsTreeInput(
        new vscode.Location(anchor.item.uri, anchor.item.selectionRange.start),
        direction.value,
      );
    } else if (oldInput instanceof CallsTreeInput) {
      newInput = new CallsTreeInput(oldInput.location, direction.value);
    }

    if (newInput) {
      tree.setInput(newInput);
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "enhanced-references.showCallHierarchy",
      (): void => {
        showCallHierarchy();
      },
    ),
    vscode.commands.registerCommand(
      "enhanced-references.showOutgoingCalls",
      (item: CallItem | unknown): void => {
        setCallsDirection(CallsDirection.Outgoing, item);
      },
    ),
    vscode.commands.registerCommand(
      "enhanced-references.showIncomingCalls",
      (item: CallItem | unknown): void => {
        setCallsDirection(CallsDirection.Incoming, item);
      },
    ),
    vscode.commands.registerCommand(
      "enhanced-references.removeCallItem",
      (item: CallItem): void => {
        removeCallItem(item);
      },
    ),
  );
};

type CallHierarchyMode = "showIncoming" | "showOutgoing";

class RichCallsDirection {
  private static key: string = "enhanced-references.callHierarchyMode";

  private callHierarchyMode: ContextKey<CallHierarchyMode> =
    new ContextKey<CallHierarchyMode>("enhanced-references.callHierarchyMode");

  public get value(): CallsDirection {
    return this.callsDirection;
  }
  public set value(value: CallsDirection) {
    this.callsDirection = value;
    this.callHierarchyMode.set(
      this.callsDirection === CallsDirection.Incoming
        ? "showIncoming"
        : "showOutgoing",
    );
    this.memento.update(RichCallsDirection.key, value);
  }

  public constructor(
    private memento: vscode.Memento,
    private callsDirection: CallsDirection = CallsDirection.Outgoing,
  ) {
    const rawCallsDirectionValue: number | undefined = memento.get(
      RichCallsDirection.key,
    );

    if (
      typeof rawCallsDirectionValue === "number" &&
      rawCallsDirectionValue >= 0 &&
      rawCallsDirectionValue <= 1
    ) {
      this.value = rawCallsDirectionValue;
    } else {
      this.value = callsDirection;
    }
  }
}
