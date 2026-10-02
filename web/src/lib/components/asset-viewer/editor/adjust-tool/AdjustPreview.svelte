<script lang="ts">
  import { adjustManager } from '$lib/managers/edit/adjust-manager.svelte';
  import { getAltText } from '$lib/utils/thumbnail-util';
  import { toTimelineAsset } from '$lib/utils/timeline-util';
  import type { AssetResponseDto } from '@immich/sdk';

  interface Props {
    asset: AssetResponseDto;
  }

  let { asset }: Props = $props();

  $effect(() => {
    if (adjustManager.canvasEl) {
      adjustManager.drawPreview();
    }
  });
</script>

<div class="flex size-full flex-col items-center justify-center p-8">
  <canvas
    bind:this={adjustManager.canvasEl}
    class="max-h-full max-w-full"
    aria-label={$getAltText(toTimelineAsset(asset))}
  ></canvas>
</div>
