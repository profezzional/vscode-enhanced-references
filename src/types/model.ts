import * as vscode from "vscode";
import {
  SymbolItemDragAndDrop,
  SymbolItemEditorHighlights,
  SymbolItemNavigation,
  SymbolsTreeInput,
  SymbolsTreeModel,
} from "../enhanced-references";
import { asResourceUrl, deleteFromArray, getThemeIcon, tail } from "../utils";

export class TypesTreeInput implements SymbolsTreeInput<TypeItem> {
  public readonly title: string;
  public readonly contextValue: string = "typeHierarchy";

  public constructor(
    public readonly location: vscode.Location,
    private readonly direction: TypeHierarchyDirection,
  ) {
    this.title =
      direction === TypeHierarchyDirection.Supertypes
        ? vscode.l10n.t("Supertypes Of")
        : vscode.l10n.t("Subtypes Of");
  }

  public async resolve(): Promise<
    vscode.ProviderResult<SymbolsTreeModel<TypesModel>>
  > {
    const items = await Promise.resolve(
      vscode.commands.executeCommand<vscode.TypeHierarchyItem[]>(
        "vscode.prepareTypeHierarchy",
        this.location.uri,
        this.location.range.start,
      ),
    );
    const model: TypesModel = new TypesModel(this.direction, items ?? []);
    const provider: TypeItemDataProvider = new TypeItemDataProvider(model);

    if (model.roots.length === 0) {
      return;
    }

    return {
      provider,
      get message(): string | undefined {
        return model.roots.length === 0
          ? vscode.l10n.t("No results.")
          : undefined;
      },
      navigation: model,
      highlights: model,
      dnd: model,
      dispose() {
        provider.dispose();
      },
    };
  }

  public with(location: vscode.Location): TypesTreeInput {
    const typesTreeInput: TypesTreeInput = new TypesTreeInput(
      location,
      this.direction,
    );

    return typesTreeInput;
  }
}

export const enum TypeHierarchyDirection {
  Subtypes = "subtypes",
  Supertypes = "supertypes",
}

export class TypeItem {
  children?: TypeItem[];

  public constructor(
    private readonly model: TypesModel,
    public readonly item: vscode.TypeHierarchyItem,
    public readonly parent: TypeItem | undefined,
  ) {}

  public remove(): void {
    this.model.remove(this);
  }
}

class TypesModel
  implements
    SymbolItemNavigation<TypeItem>,
    SymbolItemEditorHighlights<TypeItem>,
    SymbolItemDragAndDrop<TypeItem>
{
  public readonly roots: TypeItem[] = [];
  public readonly onDidChange: vscode.EventEmitter<TypesModel> =
    new vscode.EventEmitter<TypesModel>();

  public constructor(
    private readonly typeHierarchyDirection: TypeHierarchyDirection,
    items: vscode.TypeHierarchyItem[],
  ) {
    this.roots = items.map((item) => new TypeItem(this, item, undefined));
  }

  private async resolveTypes(currentType: TypeItem): Promise<TypeItem[]> {
    const types: vscode.TypeHierarchyItem[] =
      await vscode.commands.executeCommand(
        this.typeHierarchyDirection === TypeHierarchyDirection.Supertypes
          ? "vscode.provideSupertypes"
          : "vscode.provideSubtypes",
        currentType.item,
      );

    return types
      ? types.map((item: vscode.TypeHierarchyItem): TypeItem => {
          const typeItem: TypeItem = new TypeItem(this, item, currentType);

          return typeItem;
        })
      : [];
  }

  public async getTypeChildren(item: TypeItem): Promise<TypeItem[]> {
    if (!item.children) {
      item.children = await this.resolveTypes(item);
    }

    return item.children;
  }

  public getDragURI(item: TypeItem): vscode.Uri | undefined {
    const dragAndDropURI: vscode.Uri = asResourceUrl(
      item.item.uri,
      item.item.range,
    );

    return dragAndDropURI;
  }

  public location(currentType: TypeItem): vscode.Location {
    const location: vscode.Location = new vscode.Location(
      currentType.item.uri,
      currentType.item.range,
    );

    return location;
  }

  public nearest(
    uri: vscode.Uri,
    position: vscode.Position,
  ): TypeItem | undefined {
    const nearest: TypeItem | undefined =
      this.roots.find((item: TypeItem): boolean => {
        return item.item.uri.toString() === uri.toString();
      }) || this.roots[0];

    return nearest;
  }

  public next(from: TypeItem): TypeItem {
    return this.move(from, true) ?? from;
  }

  public previous(from: TypeItem): TypeItem {
    return this.move(from, false) ?? from;
  }

  private move(item: TypeItem, forward: boolean): TypeItem | undefined {
    if (item.children?.length) {
      return forward ? item.children[0] : tail(item.children);
    }

    const items: TypeItem[] | undefined = this.roots.includes(item)
      ? this.roots
      : item.parent?.children;

    if (items?.length) {
      const itemIndex: number = items.indexOf(item);
      const delta: number = forward ? 1 : -1;

      return items[itemIndex + delta + (items.length % items.length)];
    }

    return undefined; // TODO: handle this case better
  }

  public getEditorHighlights(
    currentType: TypeItem,
    uri: vscode.Uri,
  ): vscode.Range[] | undefined {
    return currentType.item.uri.toString() === uri.toString()
      ? [currentType.item.selectionRange]
      : undefined;
  }

  public remove(item: TypeItem): void {
    const isInRoot: boolean = this.roots.includes(item);
    const siblings: TypeItem[] | undefined = isInRoot
      ? this.roots
      : item.parent?.children;

    if (siblings) {
      deleteFromArray(siblings, item);
      this.onDidChange.fire(this);
    }
  }
}

class TypeItemDataProvider implements vscode.TreeDataProvider<TypeItem> {
  private readonly emitter = new vscode.EventEmitter<TypeItem | undefined>();
  private readonly modelListener: vscode.Disposable;

  public readonly onDidChangeTreeData: vscode.Event<TypeItem | undefined> =
    this.emitter.event;

  public constructor(private model: TypesModel) {
    this.modelListener = model.onDidChange.event((event: TypesModel): void => {
      this.emitter.fire(event instanceof TypeItem ? event : undefined);
    });
  }

  public dispose(): void {
    this.emitter.dispose();
    this.modelListener.dispose();
  }

  public getTreeItem(element: TypeItem): vscode.TreeItem {
    const item: vscode.TreeItem = new vscode.TreeItem(element.item.name);

    item.description = element.item.detail;
    item.contextValue = "type-item";
    item.iconPath = getThemeIcon(element.item.kind);
    item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    item.command = {
      command: "vscode.open",
      title: vscode.l10n.t("Open Type"),
      arguments: [
        element.item.uri,
        {
          selection: element.item.selectionRange.with({
            end: element.item.selectionRange.start,
          }),
        } satisfies vscode.TextDocumentShowOptions,
      ],
    };

    return item;
  }

  public async getChildren(
    element?: TypeItem | undefined,
  ): Promise<TypeItem[]> {
    return element ? this.model.getTypeChildren(element) : this.model.roots;
  }

  public getParent(element: TypeItem): TypeItem | undefined {
    return element.parent;
  }
}
