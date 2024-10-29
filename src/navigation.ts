import * as vscode from "vscode";
import { SymbolItemNavigation } from "./enhanced-references";
import { ContextKey } from "./utils";

export class Navigation {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly canNavigate: ContextKey<boolean> = new ContextKey<boolean>(
    "enhanced-references.canNavigate",
  );

  private delegate?: SymbolItemNavigation<unknown>;

  public constructor(private readonly view: vscode.TreeView<unknown>) {
    this.disposables.push(
      vscode.commands.registerCommand("enhanced-references.next", (): void => {
        this.next(false);
      }),
      vscode.commands.registerCommand("enhanced-references.prev", (): void => {
        this.previous(false);
      }),
    );
  }

  public dispose(): void {
    vscode.Disposable.from(...this.disposables).dispose();
  }

  public update(delegate: SymbolItemNavigation<unknown> | undefined) {
    this.delegate = delegate;
    this.canNavigate.set(Boolean(this.delegate));
  }

  private anchor(): undefined | unknown {
    if (!this.delegate) {
      return undefined;
    }

    const [selection] = this.view.selection;

    if (selection) {
      return selection;
    }

    if (!vscode.window.activeTextEditor) {
      return undefined;
    }

    return this.delegate.nearest(
      vscode.window.activeTextEditor.document.uri,
      vscode.window.activeTextEditor.selection.active,
    );
  }

  private open(loc: vscode.Location, preserveFocus: boolean): void {
    vscode.commands.executeCommand("vscode.open", loc.uri, {
      selection: new vscode.Selection(loc.range.start, loc.range.start),
      preserveFocus,
    });
  }

  public previous(preserveFocus: boolean): void {
    if (!this.delegate) {
      return;
    }

    const item = this.anchor();

    if (!item) {
      return;
    }

    const newItem = this.delegate.previous(item);
    const newLocation = this.delegate.location(newItem);

    if (newLocation) {
      this.view.reveal(newItem, { select: true, focus: true });
      this.open(newLocation, preserveFocus);
    }
  }

  public next(preserveFocus: boolean): void {
    if (!this.delegate) {
      return;
    }

    const item = this.anchor();

    if (!item) {
      return;
    }

    const newItem = this.delegate.next(item);
    const newLocation = this.delegate.location(newItem);

    if (newLocation) {
      this.view.reveal(newItem, { select: true, focus: true });
      this.open(newLocation, preserveFocus);
    }
  }
}
