import { cloneDocument, seedDocument, type PresentationDocument } from './presentation';

const KEY = 'negativezero:citrine:v1';

function hasElement(document: PresentationDocument, elementId: string): boolean {
  return document.scenes.some((scene) => scene.elements.some((element) => element.id === elementId));
}

export function loadStoredDocument(): PresentationDocument {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return cloneDocument(seedDocument);
    const parsed = JSON.parse(raw) as PresentationDocument;
    if (parsed?.version !== 1 || !Array.isArray(parsed.scenes)) {
      return cloneDocument(seedDocument);
    }
    if (parsed.id === seedDocument.id && parsed.source?.status !== seedDocument.source.status) {
      return cloneDocument(seedDocument);
    }
    if (parsed.id === seedDocument.id && (!hasElement(parsed, 'opening-quote') || !hasElement(parsed, 'system-checklist'))) {
      return cloneDocument(seedDocument);
    }
    return parsed;
  } catch {
    return cloneDocument(seedDocument);
  }
}

export function saveStoredDocument(document: PresentationDocument): void {
  window.localStorage.setItem(KEY, JSON.stringify(document));
}

export function clearStoredDocument(): void {
  window.localStorage.removeItem(KEY);
}
