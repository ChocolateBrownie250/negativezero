type DiagnosticLevel = 'error' | 'warning';

export type PresentationDiagnostic = {
  level: DiagnosticLevel;
  path: string;
  message: string;
};

export type PresentationStats = {
  scenes: number;
  elements: number;
  actions: number;
};

export type ValidationResult = {
  valid: boolean;
  diagnostics: PresentationDiagnostic[];
  stats: PresentationStats;
};

const SCENE_LAYOUTS = new Set(['viewport', 'content', 'aspect']);
const TRANSITIONS = new Set(['instant', 'fade', 'slide', 'scale', 'reveal', 'parallax']);
const ACTIONS = new Set(['none', 'scene', 'anchor', 'url']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function numericFrame(frame: unknown): boolean {
  if (!isRecord(frame)) return false;
  return ['x', 'y', 'width', 'height'].every((key) => {
    const value = frame[key];
    return typeof value === 'number' && Number.isFinite(value);
  });
}

function push(
  diagnostics: PresentationDiagnostic[],
  level: DiagnosticLevel,
  path: string,
  message: string,
): void {
  diagnostics.push({ level, path, message });
}

function countElementActions(element: Record<string, unknown>): number {
  const action = element.action;
  if (!isRecord(action)) return 0;
  if (action.kind === 'none') return 0;
  return 1;
}

export function validatePresentationDocument(input: unknown): ValidationResult {
  const diagnostics: PresentationDiagnostic[] = [];
  const stats: PresentationStats = { scenes: 0, elements: 0, actions: 0 };

  if (!isRecord(input)) {
    return {
      valid: false,
      diagnostics: [
        {
          level: 'error',
          path: '$',
          message: 'Document must be an object.',
        },
      ],
      stats,
    };
  }

  if (input.version !== 1) {
    push(diagnostics, 'error', '$.version', 'Document version must be 1.');
  }
  if (!stringValue(input.id)) {
    push(diagnostics, 'error', '$.id', 'Document id is required.');
  }
  if (!stringValue(input.title)) {
    push(diagnostics, 'error', '$.title', 'Document title is required.');
  }
  if (!isRecord(input.theme)) {
    push(diagnostics, 'error', '$.theme', 'Theme tokens are required.');
  }

  if (!Array.isArray(input.scenes) || input.scenes.length === 0) {
    push(diagnostics, 'error', '$.scenes', 'At least one scene is required.');
    return {
      valid: diagnostics.every((d) => d.level !== 'error'),
      diagnostics,
      stats,
    };
  }

  if (input.scenes.length > 80) {
    push(diagnostics, 'error', '$.scenes', 'Scene count cannot exceed 80.');
  }

  stats.scenes = input.scenes.length;
  const sceneIds = new Set<string>();
  const anchorIds = new Set<string>();
  const actions: Array<{ path: string; action: Record<string, unknown> }> = [];

  input.scenes.forEach((scene, sceneIndex) => {
    const scenePath = `$.scenes[${sceneIndex}]`;
    if (!isRecord(scene)) {
      push(diagnostics, 'error', scenePath, 'Scene must be an object.');
      return;
    }

    const sceneId = stringValue(scene.id);
    if (!sceneId) {
      push(diagnostics, 'error', `${scenePath}.id`, 'Scene id is required.');
    } else if (sceneIds.has(sceneId)) {
      push(diagnostics, 'error', `${scenePath}.id`, `Duplicate scene id "${sceneId}".`);
    } else {
      sceneIds.add(sceneId);
    }

    if (!stringValue(scene.title)) {
      push(diagnostics, 'error', `${scenePath}.title`, 'Scene title is required.');
    }
    if (!SCENE_LAYOUTS.has(String(scene.layout))) {
      push(diagnostics, 'error', `${scenePath}.layout`, 'Scene layout must be viewport, content, or aspect.');
    }

    const transition = scene.transition;
    if (transition !== undefined) {
      if (!isRecord(transition)) {
        push(diagnostics, 'error', `${scenePath}.transition`, 'Transition must be an object.');
      } else if (!TRANSITIONS.has(String(transition.kind))) {
        push(diagnostics, 'error', `${scenePath}.transition.kind`, 'Unsupported transition kind.');
      }
    }

    if (!Array.isArray(scene.elements)) {
      push(diagnostics, 'error', `${scenePath}.elements`, 'Scene elements must be an array.');
      return;
    }

    const elementIds = new Set<string>();
    scene.elements.forEach((element, elementIndex) => {
      const elementPath = `${scenePath}.elements[${elementIndex}]`;
      if (!isRecord(element)) {
        push(diagnostics, 'error', elementPath, 'Element must be an object.');
        return;
      }
      stats.elements += 1;
      stats.actions += countElementActions(element);

      const elementId = stringValue(element.id);
      if (!elementId) {
        push(diagnostics, 'error', `${elementPath}.id`, 'Element id is required.');
      } else {
        anchorIds.add(elementId);
        if (elementIds.has(elementId)) {
          push(diagnostics, 'error', `${elementPath}.id`, `Duplicate element id "${elementId}" in scene.`);
        }
        elementIds.add(elementId);
      }

      if (!stringValue(element.type)) {
        push(diagnostics, 'error', `${elementPath}.type`, 'Element type is required.');
      }
      if (!numericFrame(element.frame)) {
        push(diagnostics, 'error', `${elementPath}.frame`, 'Element frame requires numeric x, y, width, and height.');
      }

      if (isRecord(element.action)) {
        actions.push({ path: `${elementPath}.action`, action: element.action });
      }
    });
  });

  actions.forEach(({ path, action }) => {
    const kind = String(action.kind ?? '');
    if (!ACTIONS.has(kind)) {
      push(diagnostics, 'error', `${path}.kind`, 'Action kind must be none, scene, anchor, or url.');
      return;
    }
    if (kind === 'none') return;
    if (kind === 'scene' && !sceneIds.has(String(action.target ?? ''))) {
      push(diagnostics, 'error', `${path}.target`, 'Scene action target must reference an existing scene.');
    }
    if (kind === 'anchor' && !anchorIds.has(String(action.target ?? ''))) {
      push(diagnostics, 'error', `${path}.target`, 'Anchor action target must reference an existing element id.');
    }
    if (kind === 'url') {
      try {
        const url = new URL(String(action.href ?? ''));
        if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) {
          push(diagnostics, 'error', `${path}.href`, 'URL action must use http, https, or mailto.');
        }
      } catch {
        push(diagnostics, 'error', `${path}.href`, 'URL action href must be a valid URL.');
      }
    }
  });

  if (!isRecord(input.source) || input.source.status !== 'imported') {
    push(
      diagnostics,
      'warning',
      '$.source',
      'Source is not marked as imported; imported Claude Design provenance is still pending.',
    );
  }

  return {
    valid: diagnostics.every((d) => d.level !== 'error'),
    diagnostics,
    stats,
  };
}
