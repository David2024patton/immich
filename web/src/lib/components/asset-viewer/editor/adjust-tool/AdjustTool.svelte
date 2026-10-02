<script lang="ts">
  import { adjustManager } from '$lib/managers/edit/adjust-manager.svelte';
  import { PHOTO_FILTERS } from '$lib/utils/adjustments';
  import type { AdjustParameters } from '@immich/sdk';
  import { Button, HStack } from '@immich/ui';
  import { mdiAutoFix } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface SliderDef {
    key: keyof AdjustParameters;
    label: string;
    min: number;
    max: number;
    step: number;
  }

  const lightSliders: SliderDef[] = [
    { key: 'exposure', label: $t('editor_exposure'), min: -3, max: 3, step: 0.1 },
    { key: 'brightness', label: $t('editor_brightness'), min: -100, max: 100, step: 1 },
    { key: 'contrast', label: $t('editor_contrast'), min: -100, max: 100, step: 1 },
    { key: 'highlights', label: $t('editor_highlights'), min: -100, max: 100, step: 1 },
    { key: 'shadows', label: $t('editor_shadows'), min: -100, max: 100, step: 1 },
    { key: 'whites', label: $t('editor_whites'), min: -100, max: 100, step: 1 },
    { key: 'blacks', label: $t('editor_blacks'), min: -100, max: 100, step: 1 },
  ];

  const colorSliders: SliderDef[] = [
    { key: 'saturation', label: $t('editor_saturation'), min: -100, max: 100, step: 1 },
    { key: 'vibrance', label: $t('editor_vibrance'), min: -100, max: 100, step: 1 },
    { key: 'warmth', label: $t('editor_warmth'), min: -100, max: 100, step: 1 },
    { key: 'tint', label: $t('editor_tint'), min: -100, max: 100, step: 1 },
  ];

  const effectSliders: SliderDef[] = [
    { key: 'sharpness', label: $t('editor_sharpness'), min: 0, max: 100, step: 1 },
    { key: 'vignette', label: $t('editor_vignette'), min: 0, max: 100, step: 1 },
  ];

  function sliderValue(key: keyof AdjustParameters): number {
    const value = adjustManager.params[key];
    return typeof value === 'number' ? value : 0;
  }

  function formatValue(def: SliderDef): string {
    const value = sliderValue(def.key);
    if (def.key === 'exposure') {
      return `${value > 0 ? '+' : ''}${value.toFixed(1)}`;
    }
    return `${value > 0 ? '+' : ''}${Math.round(value)}`;
  }

  function onSliderInput(def: SliderDef, event: Event) {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    adjustManager.updateParams({ [def.key]: value } as AdjustParameters);
  }

  function resetSlider(def: SliderDef) {
    adjustManager.updateParams({ [def.key]: 0 } as AdjustParameters);
  }
</script>

<div class="mt-3 max-h-[calc(100vh-220px)] overflow-y-auto px-4">
  <div class="mt-2 flex h-10 w-full items-center justify-between text-sm">
    <h2>{$t('editor_adjust_filters')}</h2>
  </div>
  <div class="flex gap-2 overflow-x-auto pb-2">
    <Button
      size="small"
      shape="round"
      variant={adjustManager.selectedFilter === null ? 'filled' : 'outline'}
      color={adjustManager.selectedFilter === null ? 'primary' : 'secondary'}
      onclick={() => adjustManager.applyFilter(null)}
    >
      {$t('editor_filter_none')}
    </Button>
    {#each PHOTO_FILTERS as filter (filter.name)}
      <Button
        size="small"
        shape="round"
        variant={adjustManager.selectedFilter === filter.name ? 'filled' : 'outline'}
        color={adjustManager.selectedFilter === filter.name ? 'primary' : 'secondary'}
        onclick={() => adjustManager.applyFilter(filter.name)}
      >
        {filter.name}
      </Button>
    {/each}
  </div>

  <div class="mt-4 flex h-10 w-full items-center justify-between text-sm">
    <h2>{$t('editor_auto_enhance')}</h2>
  </div>
  <HStack>
    <Button
      class="w-full"
      size="small"
      shape="round"
      variant={adjustManager.params.autoEnhance ? 'filled' : 'outline'}
      color={adjustManager.params.autoEnhance ? 'primary' : 'secondary'}
      leadingIcon={mdiAutoFix}
      onclick={() => adjustManager.toggleAutoEnhance()}
      aria-pressed={adjustManager.params.autoEnhance ?? false}
    >
      {$t('editor_auto_enhance')}
    </Button>
  </HStack>

  <div class="mt-6 flex h-10 w-full items-center justify-between text-sm">
    <h2>{$t('editor_adjust_light')}</h2>
  </div>
  {#each lightSliders as def (def.key)}
    <div class="mb-3">
      <div class="flex items-center justify-between text-sm">
        <button
          type="button"
          class="text-white/80 hover:text-white"
          onclick={() => resetSlider(def)}
          title={$t('editor_reset_all_changes')}
        >
          {def.label}
        </button>
        <span class="text-white/60 tabular-nums">{formatValue(def)}</span>
      </div>
      <input
        type="range"
        class="adjust-slider w-full"
        min={def.min}
        max={def.max}
        step={def.step}
        value={sliderValue(def.key)}
        oninput={(event) => onSliderInput(def, event)}
        aria-label={def.label}
      />
    </div>
  {/each}

  <div class="mt-6 flex h-10 w-full items-center justify-between text-sm">
    <h2>{$t('editor_adjust_color')}</h2>
  </div>
  {#each colorSliders as def (def.key)}
    <div class="mb-3">
      <div class="flex items-center justify-between text-sm">
        <button
          type="button"
          class="text-white/80 hover:text-white"
          onclick={() => resetSlider(def)}
          title={$t('editor_reset_all_changes')}
        >
          {def.label}
        </button>
        <span class="text-white/60 tabular-nums">{formatValue(def)}</span>
      </div>
      <input
        type="range"
        class="adjust-slider w-full"
        min={def.min}
        max={def.max}
        step={def.step}
        value={sliderValue(def.key)}
        oninput={(event) => onSliderInput(def, event)}
        aria-label={def.label}
      />
    </div>
  {/each}

  <div class="mt-6 flex h-10 w-full items-center justify-between text-sm">
    <h2>{$t('editor_adjust_effects')}</h2>
  </div>
  {#each effectSliders as def (def.key)}
    <div class="mb-3">
      <div class="flex items-center justify-between text-sm">
        <button
          type="button"
          class="text-white/80 hover:text-white"
          onclick={() => resetSlider(def)}
          title={$t('editor_reset_all_changes')}
        >
          {def.label}
        </button>
        <span class="text-white/60 tabular-nums">{formatValue(def)}</span>
      </div>
      <input
        type="range"
        class="adjust-slider w-full"
        min={def.min}
        max={def.max}
        step={def.step}
        value={sliderValue(def.key)}
        oninput={(event) => onSliderInput(def, event)}
        aria-label={def.label}
      />
    </div>
  {/each}
</div>

<style>
  .adjust-slider {
    -webkit-appearance: none;
    appearance: none;
    height: 4px;
    border-radius: 9999px;
    background: rgb(255 255 255 / 0.2);
    outline: none;
    cursor: pointer;
  }
  .adjust-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #fff;
    border: none;
    cursor: pointer;
  }
  .adjust-slider::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #fff;
    border: none;
    cursor: pointer;
  }
</style>
