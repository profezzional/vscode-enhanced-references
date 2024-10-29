import * as vscode from "vscode";
import {
  SymbolItemDragAndDrop,
  SymbolItemEditorHighlights,
  SymbolItemNavigation,
  SymbolsTreeInput,
  SymbolsTreeModel,
} from "../enhanced-references";
import { asResourceUrl, deleteFromArray, getThemeIcon, tail } from "../utils";

export class CallsTreeInput implements SymbolsTreeInput<CallItem> {
  public readonly title: string;
  public readonly contextValue: string = "callHierarchy";

  public constructor(
    public readonly location: vscode.Location,
    private readonly direction: CallsDirection,
  ) {
    this.title =
      direction === CallsDirection.Incoming
        ? vscode.l10n.t("Callers Of")
        : vscode.l10n.t("Calls From");
  }

  public async resolve<T>(): Promise<SymbolsTreeModel<T> | undefined> {
    const items = await Promise.resolve(
      vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
        "vscode.prepareCallHierarchy",
        this.location.uri,
        this.location.range.start,
      ),
    );
    const model: CallsModel = new CallsModel(this.direction, items ?? []);
    const provider: CallItemDataProvider = new CallItemDataProvider(model);

    if (model.roots.length === 0) {
      return undefined;
    }

    return {
      provider,
      get message() {
        return model.roots.length === 0
          ? vscode.l10n.t("No results.")
          : undefined;
      },
      navigation: model,
      highlights: model,
      dnd: model,
      dispose(): void {
        provider.dispose();
      },
    };
  }

  public with(location: vscode.Location): CallsTreeInput {
    return new CallsTreeInput(location, this.direction);
  }
}

export const enum CallsDirection {
  Incoming = "showIncoming",
  Outgoing = "showOutgoing",
}

export class CallItem {
  children?: CallItem[];

  constructor(
    readonly model: CallsModel,
    readonly item: vscode.CallHierarchyItem,
    readonly parent: CallItem | undefined,
    readonly locations: vscode.Location[] | undefined,
  ) {}

  remove(): void {
    this.model.remove(this);
  }
}

class CallsModel
  implements
    SymbolItemNavigation<CallItem>,
    SymbolItemEditorHighlights<CallItem>,
    SymbolItemDragAndDrop<CallItem>
{
  readonly roots: CallItem[] = [];

  public readonly onDidChange = new vscode.EventEmitter<CallsModel>();

  constructor(
    readonly direction: CallsDirection,
    items: vscode.CallHierarchyItem[],
  ) {
    this.roots = items.map(
      (item) => new CallItem(this, item, undefined, undefined),
    );
  }

  private async resolveCalls(call: CallItem): Promise<CallItem[]> {
    if (this.direction === CallsDirection.Incoming) {
      const calls = await vscode.commands.executeCommand<
        vscode.CallHierarchyIncomingCall[]
      >("vscode.provideIncomingCalls", call.item);
      return calls
        ? calls.map(
            (item) =>
              new CallItem(
                this,
                item.from,
                call,
                item.fromRanges.map(
                  (range) => new vscode.Location(item.from.uri, range),
                ),
              ),
          )
        : [];
    } else {
      const calls = await vscode.commands.executeCommand<
        vscode.CallHierarchyOutgoingCall[]
      >("vscode.provideOutgoingCalls", call.item);
      return calls
        ? calls.map(
            (item) =>
              new CallItem(
                this,
                item.to,
                call,
                item.fromRanges.map(
                  (range) => new vscode.Location(call.item.uri, range),
                ),
              ),
          )
        : [];
    }
  }

  public async getCallChildren(call: CallItem): Promise<CallItem[]> {
    if (!call.children) {
      call.children = await this.resolveCalls(call);
    }

    return call.children;
  }

  public location(item: CallItem): vscode.Location {
    return new vscode.Location(item.item.uri, item.item.range);
  }

  public nearest(
    uri: vscode.Uri,
    _position: vscode.Position,
  ): CallItem | undefined {
    return (
      this.roots.find((item) => item.item.uri.toString() === uri.toString()) ??
      this.roots[0]
    );
  }

  public next(from: CallItem): CallItem {
    return this.move(from, true) ?? from;
  }

  public previous(from: CallItem): CallItem {
    return this.move(from, false) ?? from;
  }

  private move(item: CallItem, forward: boolean): CallItem | undefined {
    if (item.children?.length) {
      return forward ? item.children[0] : tail(item.children);
    }

    const array: CallItem[] | undefined = this.roots.includes(item)
      ? this.roots
      : item.parent?.children;

    if (array?.length) {
      const itemIndex: number = array.indexOf(item);
      const delta: number = forward ? 1 : -1;

      return array[itemIndex + delta + (array.length % array.length)];
    }

    return undefined; // TODO: handle this case better
  }

  public getDragURI(item: CallItem): vscode.Uri | undefined {
    return asResourceUrl(item.item.uri, item.item.range);
  }

  public getEditorHighlights(
    item: CallItem,
    uri: vscode.Uri,
  ): vscode.Range[] | undefined {
    if (!item.locations) {
      return item.item.uri.toString() === uri.toString()
        ? [item.item.selectionRange]
        : undefined;
    }

    return item.locations
      .filter((location): boolean => {
        return location.uri.toString() === uri.toString();
      })
      .map((location: vscode.Location): vscode.Range => location.range);
  }

  public remove(item: CallItem): void {
    const isInRoot: boolean = this.roots.includes(item);
    const siblings: CallItem[] | undefined = isInRoot
      ? this.roots
      : item.parent?.children;

    if (siblings) {
      deleteFromArray(siblings, item);
      this.onDidChange.fire(this);
    }
  }
}

type OpenArgs = [vscode.Uri, vscode.TextDocumentShowOptions];

class CallItemDataProvider implements vscode.TreeDataProvider<CallItem> {
  private readonly emitter: vscode.EventEmitter<CallItem | undefined> =
    new vscode.EventEmitter<CallItem | undefined>();
  private readonly modelListener: vscode.Disposable;

  public constructor(private model: CallsModel) {
    this.modelListener = model.onDidChange.event((event: CallsModel): void => {
      this.emitter.fire(event instanceof CallItem ? event : undefined);
    });
  }

  public dispose(): void {
    this.emitter.dispose();
    this.modelListener.dispose();
  }

  public getTreeItem(element: CallItem): vscode.TreeItem {
    const item: vscode.TreeItem = new vscode.TreeItem(element.item.name);
    item.description = element.item.detail;
    item.tooltip =
      item.label && element.item.detail
        ? `${item.label} - ${element.item.detail}`
        : item.label
          ? `${item.label}`
          : element.item.detail;
    item.contextValue = "call-item";
    item.iconPath = getThemeIcon(element.item.kind);

    let openArgs: OpenArgs;

    if (element.model.direction === CallsDirection.Outgoing) {
      openArgs = [
        element.item.uri,
        {
          selection: element.item.selectionRange.with({
            end: element.item.selectionRange.start,
          }),
        },
      ];
    } else {
      // incoming call -> reveal first call instead of caller
      let firstLocationStartPosition: vscode.Position | undefined;

      if (element.locations) {
        for (const location of element.locations) {
          if (location.uri.toString() === element.item.uri.toString()) {
            firstLocationStartPosition = firstLocationStartPosition?.isBefore(
              location.range.start,
            )
              ? firstLocationStartPosition
              : location.range.start;
          }
        }
      }

      if (!firstLocationStartPosition) {
        firstLocationStartPosition = element.item.selectionRange.start;
      }

      openArgs = [
        element.item.uri,
        {
          selection: new vscode.Range(
            firstLocationStartPosition,
            firstLocationStartPosition,
          ),
        },
      ];
    }

    item.command = {
      command: "vscode.open",
      title: vscode.l10n.t("Open Call"),
      arguments: openArgs,
    };
    item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

    return item;
  }

  public async getChildren(
    element?: CallItem | undefined,
  ): Promise<CallItem[]> {
    return element ? this.model.getCallChildren(element) : this.model.roots;
  }

  public getParent(element: CallItem): CallItem | undefined {
    return element.parent;
  }
}
