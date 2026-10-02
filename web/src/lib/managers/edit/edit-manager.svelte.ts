import { editAsset, removeAssetEdits, type AssetEditsCreateDto, type AssetResponseDto } from '@immich/sdk';
import { ConfirmModal, modalManager, toastManager } from '@immich/ui';
import { mdiCropRotate, mdiTune } from '@mdi/js';
import type { Component } from 'svelte';
import { SvelteSet } from 'svelte/reactivity';
import AdjustTool from '$lib/components/asset-viewer/editor/adjust-tool/AdjustTool.svelte';
import TransformTool from '$lib/components/asset-viewer/editor/transform-tool/TransformTool.svelte';
import { adjustManager } from '$lib/managers/edit/adjust-manager.svelte';
import { transformManager } from '$lib/managers/edit/transform-manager.svelte';
import { eventManager } from '$lib/managers/event-manager.svelte';
import { waitForWebsocketEvent } from '$lib/stores/websocket';
import { getFormatter } from '$lib/utils/i18n';

export type EditAction = AssetEditsCreateDto['edits'][number];
export type EditActions = EditAction[];

export interface EditToolManager {
  onActivate: (asset: AssetResponseDto, edits: EditActions) => Promise<void>;
  onDeactivate: () => void;
  /** Called when switching to another tool; state must be kept for resume. */
  onPause?: () => void;
  /** Called when switching back to a previously activated tool. */
  onResume?: (asset: AssetResponseDto) => Promise<void> | void;
  resetAllChanges: () => Promise<void>;
  hasChanges: boolean;
  canReset: boolean;
  edits: EditAction[];
}

export enum EditToolType {
  Transform = 'transform',
  Adjust = 'adjust',
}

export interface EditTool {
  type: EditToolType;
  icon: string;
  component: Component;
  manager: EditToolManager;
}

export class EditManager {
  tools: EditTool[] = [
    {
      type: EditToolType.Transform,
      icon: mdiCropRotate,
      component: TransformTool,
      manager: transformManager,
    },
    {
      type: EditToolType.Adjust,
      icon: mdiTune,
      component: AdjustTool,
      manager: adjustManager,
    },
  ];

  currentAsset = $state<AssetResponseDto | null>(null);
  selectedTool = $state<EditTool | null>(null);
  private activatedTools = new SvelteSet<EditToolType>();

  // used to disable multiple confirm dialogs and mouse events while one is open
  isShowingConfirmDialog = $state(false);
  isApplyingEdits = $state(false);
  hasAppliedEdits = $state(false);

  hasUnsavedChanges = $derived(this.tools.some((t) => t.manager.hasChanges) && !this.hasAppliedEdits);
  canReset = $derived(this.tools.some((t) => t.manager.canReset));

  async closeConfirm(): Promise<boolean> {
    // Prevent multiple dialogs (usually happens with rapid escape key presses)
    if (this.isShowingConfirmDialog) {
      return false;
    }

    if (!this.hasUnsavedChanges) {
      return true;
    }

    this.isShowingConfirmDialog = true;

    const t = await getFormatter();

    const confirmed = await modalManager.show(ConfirmModal, {
      title: t('editor_discard_edits_title'),
      prompt: t('editor_discard_edits_prompt'),
      confirmText: t('editor_discard_edits_confirm'),
    });

    this.isShowingConfirmDialog = false;

    return confirmed;
  }

  reset() {
    for (const tool of this.tools) {
      tool.manager.onDeactivate?.();
    }
    this.selectedTool = this.tools[0];
  }

  async activateTool(toolType: EditToolType, asset: AssetResponseDto, edits: AssetEditsCreateDto) {
    this.hasAppliedEdits = false;
    if (this.selectedTool?.type === toolType) {
      return;
    }

    this.currentAsset = asset;

    this.selectedTool?.manager.onPause?.();
    const newTool = this.tools.find((t) => t.type === toolType);
    if (newTool) {
      this.selectedTool = newTool;
      if (this.activatedTools.has(toolType)) {
        await newTool.manager.onResume?.(asset);
      } else {
        this.activatedTools.add(toolType);
        await newTool.manager.onActivate?.(asset, edits.edits);
      }
    }
  }

  cleanup() {
    for (const tool of this.tools) {
      tool.manager.onDeactivate?.();
    }
    this.activatedTools.clear();
    this.currentAsset = null;
    this.selectedTool = null;
  }

  async resetAllChanges() {
    for (const tool of this.tools) {
      await tool.manager.resetAllChanges();
    }
  }

  async applyEdits(): Promise<boolean> {
    this.isApplyingEdits = true;

    const edits = this.tools.flatMap((tool) => tool.manager.edits);
    if (!this.currentAsset) {
      return false;
    }

    const assetId = this.currentAsset.id;
    const t = await getFormatter();

    try {
      // Setup the websocket listener before sending the edit request
      const editCompleted = waitForWebsocketEvent('AssetEditReadyV2', (event) => event.asset.id === assetId, 10_000);

      await (edits.length === 0
        ? removeAssetEdits({ id: assetId })
        : editAsset({
            id: assetId,
            assetEditsCreateDto: {
              edits,
            },
          }));

      await editCompleted;

      eventManager.emit('AssetEditsApplied', assetId);

      toastManager.primary(t('editor_edits_applied_success'));
      this.hasAppliedEdits = true;

      return true;
    } catch {
      toastManager.danger(t('editor_edits_applied_error'));
      return false;
    } finally {
      this.isApplyingEdits = false;
    }
  }
}

export const editManager = new EditManager();
