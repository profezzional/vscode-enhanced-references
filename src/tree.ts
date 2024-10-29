import * as vscode from "vscode";
import {
  SymbolItemDragAndDrop,
  SymbolsTreeInput,
  SymbolsTreeModel,
} from "./enhanced-references";
import { EditorHighlights } from "./highlights";
import { Navigation } from "./navigation";
import { ContextKey, isValidRequestPosition, WordAnchor } from "./utils";

export class SymbolsTree<T> {
  private readonly viewID: string = "enhanced-references.tree";

  private readonly isActive: ContextKey<boolean> = new ContextKey<boolean>(
    "reference-list.isActive",
  );
  private readonly hasResult: ContextKey<boolean> = new ContextKey<boolean>(
    "reference-list.hasResult",
  );
  private readonly inputSource: ContextKey<string> = new ContextKey<string>(
    "reference-list.source",
  );

  private readonly treeInputHistory: TreeInputHistory<T> = new TreeInputHistory(
    this,
  );
  private readonly treeDataProviderDelegate: TreeDataProviderDelegate =
    new TreeDataProviderDelegate();
  private readonly treeDragAndDropDelegate: TreeDragAndDropDelegate =
    new TreeDragAndDropDelegate();
  private readonly treeView: vscode.TreeView<unknown>;
  private readonly navigation: Navigation;

  private symbolTreeInput?: SymbolsTreeInput<T>;
  private sessionDisposable?: vscode.Disposable;

  public constructor() {
    this.treeView = vscode.window.createTreeView<unknown>(this.viewID, {
      treeDataProvider: this.treeDataProviderDelegate,
      showCollapseAll: true,
      dragAndDropController: this.treeDragAndDropDelegate,
    });
    this.navigation = new Navigation(this.treeView);
  }

  public dispose(): void {
    this.treeInputHistory.dispose();
    this.treeView.dispose();
    this.sessionDisposable?.dispose();
  }

  public getInput(): SymbolsTreeInput<T> | undefined {
    return this.symbolTreeInput;
  }

  public async setInput(input: SymbolsTreeInput<T>): Promise<void> {
    const inputLocationIsValidRequestPosition: boolean =
      await isValidRequestPosition(
        input.location.uri,
        input.location.range.start,
      );

    if (!inputLocationIsValidRequestPosition) {
      this.clearInput();

      return;
    }

    this.inputSource.set(input.contextValue);
    this.isActive.set(true);
    this.hasResult.set(true);

    vscode.commands.executeCommand(`${this.viewID}.focus`);

    const isNewInputKind: boolean =
      !this.symbolTreeInput ||
      Object.getPrototypeOf(this.symbolTreeInput) !==
        Object.getPrototypeOf(input);
    this.symbolTreeInput = input;
    this.sessionDisposable?.dispose();

    this.treeView.title = input.title;
    this.treeView.message = isNewInputKind ? undefined : this.treeView.message;

    const modelPromise: Promise<SymbolsTreeModel<unknown> | null | undefined> =
      Promise.resolve(input.resolve());

    // set promise to tree data provider to trigger tree loading UI
    this.treeDataProviderDelegate.update(
      modelPromise.then(
        (model: SymbolsTreeModel<unknown> | null | undefined) => {
          return model?.provider ?? this.treeInputHistory;
        },
      ),
    );
    this.treeDragAndDropDelegate.update(
      modelPromise.then(
        (model: SymbolsTreeModel<unknown> | null | undefined) => {
          return model?.dragAndDrop;
        },
      ),
    );

    const model: SymbolsTreeModel<unknown> | null | undefined =
      await modelPromise;

    if (this.symbolTreeInput !== input) {
      return;
    }

    if (!model) {
      this.clearInput();

      return;
    }

    this.treeInputHistory.add(input);
    this.treeView.message = model.message;

    this.navigation.update(model.navigation);

    const selection = model.navigation?.nearest(
      input.location.uri,
      input.location.range.start,
    );

    if (selection && this.treeView.visible) {
      await this.treeView.reveal(selection, {
        select: true,
        focus: true,
        expand: true,
      });
    }

    const disposables: vscode.Disposable[] = [];

    let highlights: EditorHighlights<unknown> | undefined;

    if (model.highlights) {
      highlights = new EditorHighlights(this.treeView, model.highlights);
      disposables.push(highlights);
    }

    if (model.provider.onDidChangeTreeData) {
      disposables.push(
        model.provider.onDidChangeTreeData(() => {
          this.treeView.title = input.title;
          this.treeView.message = model.message;
          highlights?.update();
        }),
      );
    }

    if (typeof model.dispose === "function") {
      disposables.push(new vscode.Disposable(() => model.dispose!()));
    }

    this.sessionDisposable = vscode.Disposable.from(...disposables);
  }

  public clearInput(): void {
    this.sessionDisposable?.dispose();
    this.symbolTreeInput = undefined;
    this.hasResult.set(false);
    this.inputSource.reset();
    this.treeView.title = vscode.l10n.t("References");
    this.treeView.message =
      this.treeInputHistory.size === 0
        ? vscode.l10n.t("No results.")
        : vscode.l10n.t("No results. Try running a previous search again:");
    this.treeDataProviderDelegate.update(
      Promise.resolve(this.treeInputHistory),
    );
  }
}

interface ActiveTreeDataProviderWrapper {
  provider: Promise<vscode.TreeDataProvider<any>>;
}

class TreeDataProviderDelegate implements vscode.TreeDataProvider<undefined> {
  provider?: Promise<vscode.TreeDataProvider<any>>;

  private sessionDisposables?: vscode.Disposable;
  public readonly onDidChange: vscode.EventEmitter<any> =
    new vscode.EventEmitter<any>();

  public update(provider: Promise<vscode.TreeDataProvider<any>>) {
    this.sessionDisposables?.dispose();
    this.sessionDisposables = undefined;

    this.onDidChange.fire(undefined);

    this.provider = provider;

    provider
      .then((value: vscode.TreeDataProvider<any>): void => {
        if (this.provider === provider && value.onDidChangeTreeData) {
          this.sessionDisposables = value.onDidChangeTreeData(
            this.onDidChange.fire,
            this.onDidChange,
          );
        }
      })
      .catch((error: Error): void => {
        this.provider = undefined;
        console.error(error);
      });
  }

  public async getTreeItem(element: unknown): Promise<vscode.TreeItem> {
    this.assertProvider();
    return (await this.provider).getTreeItem(element);
  }

  public async getChildren(
    parent?: unknown | undefined,
  ): Promise<vscode.ProviderResult<any[]>> {
    this.assertProvider();
    const provider: vscode.TreeDataProvider<any> = await this.provider;

    return provider.getChildren(parent);
  }

  public async getParent(element: unknown) {
    this.assertProvider();
    const provider: vscode.TreeDataProvider<any> = await this.provider;

    return provider.getParent ? provider.getParent(element) : undefined;
  }

  private assertProvider(): asserts this is ActiveTreeDataProviderWrapper {
    if (!this.provider) {
      throw new Error("MISSING provider");
    }
  }
}

// --- tree dnd

class TreeDragAndDropDelegate
  implements vscode.TreeDragAndDropController<undefined>
{
  private dragAndDropDelegate: SymbolItemDragAndDrop<undefined> | undefined;

  public readonly dropMimeTypes: string[] = [];
  public readonly dragMimeTypes: string[] = ["text/uri-list"];

  public update(
    delegate: Promise<SymbolItemDragAndDrop<unknown> | undefined>,
  ): void {
    this.dragAndDropDelegate = undefined;
    delegate.then((value: SymbolItemDragAndDrop<unknown> | undefined): void => {
      this.dragAndDropDelegate = value;
    });
  }

  public handleDrag(source: undefined[], data: vscode.DataTransfer): void {
    if (!this.dragAndDropDelegate) {
      return;
    }

    const urls: string[] = [];

    for (const item of source) {
      const uri: vscode.Uri | undefined =
        this.dragAndDropDelegate.getDragURI(item);

      if (uri) {
        urls.push(uri.toString());
      }
    }

    if (urls.length > 0) {
      data.set("text/uri-list", new vscode.DataTransferItem(urls.join("\r\n")));
    }
  }

  public handleDrop(): void {
    throw new Error("Method not implemented.");
  }
}

class HistoryItem<T> {
  public readonly description: string;

  public constructor(
    public readonly key: string,
    public readonly word: string,
    public readonly anchor: WordAnchor,
    public readonly input: SymbolsTreeInput<T>,
  ) {
    this.description = `${vscode.workspace.asRelativePath(input.location.uri)} • ${input.title.toLocaleLowerCase()}`;
  }
}

class TreeInputHistory<T> implements vscode.TreeDataProvider<HistoryItem<T>> {
  public readonly onDidChangeTreeData = new vscode.EventEmitter<
    HistoryItem<T> | undefined
  >();

  private readonly disposables: vscode.Disposable[] = [];
  private readonly hasHistory: ContextKey<boolean> = new ContextKey<boolean>(
    "reference-list.hasHistory",
  );
  private readonly inputs: Map<string, HistoryItem<T>> = new Map<
    string,
    HistoryItem<T>
  >();

  public constructor(private readonly tree: SymbolsTree<T>) {
    this.disposables.push(
      vscode.commands.registerCommand("enhanced-references.clear", () =>
        tree.clearInput(),
      ),
      vscode.commands.registerCommand(
        "enhanced-references.clearHistory",
        () => {
          this.clear();
          tree.clearInput();
        },
      ),
      vscode.commands.registerCommand("enhanced-references.refind", (item) => {
        if (item instanceof HistoryItem) {
          this.rerunHistoryItem(item);
        }
      }),
      vscode.commands.registerCommand("enhanced-references.refresh", () => {
        const item = Array.from(this.inputs.values()).pop();
        if (item) {
          this.rerunHistoryItem(item);
        }
      }),
      vscode.commands.registerCommand(
        "_enhanced-references.showHistoryItem",
        async (item): Promise<void> => {
          if (!(item instanceof HistoryItem)) {
            return;
          }

          const position: vscode.Position =
            item.anchor.guessedTrackedPosition() ??
            item.input.location.range.start;

          await vscode.commands.executeCommand(
            "vscode.open",
            item.input.location.uri,
            { selection: new vscode.Range(position, position) },
          );
        },
      ),
      vscode.commands.registerCommand(
        "enhanced-references.pickFromHistory",
        async (): Promise<void> => {
          interface HistoryPick extends vscode.QuickPickItem {
            item: HistoryItem<T>;
          }

          const entries: HistoryItem<T>[] = await this.getChildren();
          const picks: HistoryPick[] = entries.map(
            (item: HistoryItem<T>): HistoryPick => ({
              label: item.word,
              description: item.description,
              item,
            }),
          );
          const pick: HistoryPick | undefined =
            await vscode.window.showQuickPick(picks, {
              placeHolder: vscode.l10n.t("Select previous reference search"),
            });

          if (pick) {
            this.rerunHistoryItem(pick.item);
          }
        },
      ),
    );
  }

  public dispose(): void {
    vscode.Disposable.from(...this.disposables).dispose();
    this.onDidChangeTreeData.dispose();
  }

  private rerunHistoryItem(item: HistoryItem<T>): void {
    this.inputs.delete(item.key);

    const newPosition = item.anchor.guessedTrackedPosition();
    let newInput: SymbolsTreeInput<T> = item.input;

    // create a new input when having a tracked position, which is
    // different than the original position.
    if (newPosition && !item.input.location.range.start.isEqual(newPosition)) {
      newInput = item.input.with(
        new vscode.Location(item.input.location.uri, newPosition),
      );
    }

    this.tree.setInput(newInput);
  }

  public async add(input: SymbolsTreeInput<T>): Promise<void> {
    const document: vscode.TextDocument =
      await vscode.workspace.openTextDocument(input.location.uri);

    const anchor: WordAnchor = new WordAnchor(
      document,
      input.location.range.start,
    );
    const range: vscode.Range | undefined =
      document.getWordRangeAtPosition(input.location.range.start) ??
      document.getWordRangeAtPosition(input.location.range.start, /[^\s]+/);
    const word: string = range ? document.getText(range) : "???";

    const item: HistoryItem<T> = new HistoryItem<T>(
      JSON.stringify([
        range?.start ?? input.location.range.start,
        input.location.uri,
        input.title,
      ]),
      word,
      anchor,
      input,
    );

    // use filo-ordering of native maps
    this.inputs.delete(item.key);
    this.inputs.set(item.key, item);
    this.hasHistory.set(true);
  }

  public clear(): void {
    this.inputs.clear();
    this.hasHistory.set(false);
    this.onDidChangeTreeData.fire(undefined);
  }

  public get size(): number {
    return this.inputs.size;
  }

  public getTreeItem(item: HistoryItem<T>): vscode.TreeItem {
    const result: vscode.TreeItem = new vscode.TreeItem(item.word);
    result.description = item.description;
    result.command = {
      command: "_enhanced-references.showHistoryItem",
      arguments: [item],
      title: vscode.l10n.t("Rerun"),
    };
    result.collapsibleState = vscode.TreeItemCollapsibleState.None;
    result.contextValue = "history-item";

    return result;
  }

  public async getChildren(): Promise<HistoryItem<T>[]> {
    return Promise.all([...this.inputs.values()].reverse());
  }

  public getParent(): undefined {
    return undefined;
  }
}
