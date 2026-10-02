import { AssetEditAction, AssetMediaSize, type AdjustParameters, type AssetResponseDto } from '@immich/sdk';
import { type EditActions, type EditToolManager } from '$lib/managers/edit/edit-manager.svelte';
import { getAssetMediaUrl } from '$lib/utils';
import {
  applyAdjustmentsToImageData,
  compactAdjustParameters,
  isAdjustNoop,
  PHOTO_FILTERS,
} from '$lib/utils/adjustments';
import { handleError } from '$lib/utils/handle-error';

class AdjustManager implements EditToolManager {
  params = $state<AdjustParameters>({});
  selectedFilter = $state<string | null>(null);
  imgElement = $state<HTMLImageElement | null>(null);
  canvasEl = $state<HTMLCanvasElement | null>(null);

  hasChanges = $derived(!isAdjustNoop(this.params));
  canReset = $derived(this.hasChanges);
  edits = $derived.by(() => this.getEdits());

  private drawHandle: number | null = null;

  getEdits(): EditActions {
    const compacted = compactAdjustParameters(this.params);
    return compacted ? [{ action: AssetEditAction.Adjust, parameters: compacted }] : [];
  }

  updateParams(patch: AdjustParameters) {
    this.params = { ...this.params, ...patch };
    this.selectedFilter = null;
    this.scheduleDraw();
  }

  toggleAutoEnhance() {
    this.params = { ...this.params, autoEnhance: !this.params.autoEnhance };
    this.selectedFilter = null;
    this.scheduleDraw();
  }

  applyFilter(name: string | null) {
    const filter = PHOTO_FILTERS.find((f) => f.name === name);
    this.params = filter ? { ...filter.params } : {};
    this.selectedFilter = name;
    this.scheduleDraw();
  }

  scheduleDraw() {
    if (this.drawHandle !== null) {
      return;
    }
    this.drawHandle = requestAnimationFrame(() => {
      this.drawHandle = null;
      this.drawPreview();
    });
  }

  drawPreview() {
    const img = this.imgElement;
    const canvas = this.canvasEl;
    if (!img || !canvas || !img.complete || img.naturalWidth === 0) {
      return;
    }

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    context.drawImage(img, 0, 0);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    applyAdjustmentsToImageData(imageData, this.params);
    context.putImageData(imageData, 0, 0);
  }

  resetAllChanges(): Promise<void> {
    this.params = {};
    this.selectedFilter = null;
    this.drawPreview();
    return Promise.resolve();
  }

  onActivate(asset: AssetResponseDto, edits: EditActions): Promise<void> {
    const adjustEdit = edits.find((edit) => edit.action === AssetEditAction.Adjust);
    this.params = adjustEdit ? { ...(adjustEdit.parameters as AdjustParameters) } : {};
    this.selectedFilter = null;

    this.imgElement = new Image();
    this.imgElement.src = getAssetMediaUrl({
      id: asset.id,
      cacheKey: asset.thumbhash,
      edited: false,
      size: AssetMediaSize.Preview,
    });
    this.imgElement.addEventListener('load', () => this.drawPreview(), { passive: true });
    this.imgElement.addEventListener('error', (error) => handleError(error, 'ErrorLoadingImage'), { passive: true });
    return Promise.resolve();
  }

  onPause() {
    if (this.drawHandle !== null) {
      cancelAnimationFrame(this.drawHandle);
      this.drawHandle = null;
    }
  }

  onResume() {
    this.drawPreview();
  }

  onDeactivate() {
    this.onPause();
    this.imgElement = null;
    this.canvasEl = null;
    this.params = {};
    this.selectedFilter = null;
  }
}

export const adjustManager = new AdjustManager();
