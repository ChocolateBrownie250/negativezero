import { describe, expect, it } from 'vitest';
import { createApp } from '../index.js';
import { validatePresentationDocument } from '../lib/presentationSchema.js';
import { mintSsoSession } from '../lib/ssoSession.js';

const validDocument = {
  version: 1,
  id: 'isg-studio-seed',
  title: 'ISG Studio',
  theme: {
    background: '#0a0a0d',
    text: '#f5f5f7',
    accent: '#0a84ff',
  },
  source: {
    status: 'imported',
    name: 'ISG Studio.html',
  },
  scenes: [
    {
      id: 'opening',
      title: 'Opening',
      layout: 'viewport',
      transition: { kind: 'fade' },
      elements: [
        {
          id: 'headline',
          type: 'headline',
          frame: { x: 8, y: 12, width: 52, height: 20 },
          props: { text: 'ISG Studio' },
          action: { kind: 'scene', target: 'system' },
        },
      ],
    },
    {
      id: 'system',
      title: 'System',
      layout: 'viewport',
      transition: { kind: 'slide' },
      elements: [
        {
          id: 'system-title',
          type: 'headline',
          frame: { x: 8, y: 12, width: 44, height: 18 },
          props: { text: 'Reusable presentation system' },
        },
      ],
    },
  ],
};

describe('validatePresentationDocument', () => {
  it('accepts a valid narrative-scene document', () => {
    const result = validatePresentationDocument(validDocument);

    expect(result.valid).toBe(true);
    expect(result.stats).toEqual({ scenes: 2, elements: 2, actions: 1 });
    expect(result.diagnostics.filter((d) => d.level === 'error')).toEqual([]);
  });

  it('rejects duplicate scenes and broken action targets', () => {
    const result = validatePresentationDocument({
      ...validDocument,
      scenes: [
        validDocument.scenes[0],
        {
          ...validDocument.scenes[1],
          id: 'opening',
          elements: [
            {
              id: 'bad-action',
              type: 'button',
              frame: { x: 0, y: 0, width: 10, height: 4 },
              action: { kind: 'scene', target: 'missing' },
            },
          ],
        },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.diagnostics.some((d) => d.message.includes('Duplicate scene id'))).toBe(true);
    expect(result.diagnostics.some((d) => d.message.includes('existing scene'))).toBe(true);
  });

  it('accepts explicit none actions without counting them as navigation', () => {
    const result = validatePresentationDocument({
      ...validDocument,
      scenes: [
        {
          ...validDocument.scenes[0],
          elements: [
            {
              id: 'quiet-label',
              type: 'body',
              frame: { x: 8, y: 20, width: 40, height: 12 },
              props: { text: 'No interaction' },
              action: { kind: 'none' },
            },
          ],
        },
      ],
    });

    expect(result.valid).toBe(true);
    expect(result.stats.actions).toBe(0);
  });

  it('accepts upgraded premade element types and optional style metadata', () => {
    const result = validatePresentationDocument({
      ...validDocument,
      scenes: [
        {
          ...validDocument.scenes[0],
          elements: [
            {
              id: 'visual-proof',
              type: 'media',
              frame: { x: 52, y: 12, width: 34, height: 30 },
              style: { tone: 'outline', radius: 'soft', accent: '#f2552f' },
              props: { title: 'Visual', src: '', alt: 'Visual proof', caption: 'Evidence image' },
            },
            {
              id: 'pull-quote',
              type: 'quote',
              frame: { x: 8, y: 42, width: 40, height: 22 },
              props: { quote: 'Scenes are product states.', source: 'Studio principle' },
            },
            {
              id: 'readiness',
              type: 'checklist',
              frame: { x: 52, y: 48, width: 34, height: 28 },
              props: { title: 'Ready', items: 'Narrative\nData\nActions' },
            },
            {
              id: 'section-rule',
              type: 'divider',
              frame: { x: 8, y: 76, width: 72, height: 8 },
              props: { label: 'Next', progress: 60 },
            },
          ],
        },
        validDocument.scenes[1],
      ],
    });

    expect(result.valid).toBe(true);
    expect(result.stats).toEqual({ scenes: 2, elements: 5, actions: 0 });
  });

  it('rejects unsafe URL actions', () => {
    const result = validatePresentationDocument({
      ...validDocument,
      scenes: [
        {
          ...validDocument.scenes[0],
          elements: [
            {
              id: 'unsafe-link',
              type: 'button',
              frame: { x: 8, y: 20, width: 20, height: 8 },
              props: { label: 'Open' },
              action: { kind: 'url', href: 'javascript:alert(1)' },
            },
          ],
        },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.diagnostics.some((d) => d.path.endsWith('.href'))).toBe(true);
  });
});

describe('presentation routes', () => {
  it('rejects unauthenticated validation requests', async () => {
    const app = await createApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/presentation/validate',
      payload: { document: validDocument },
    });
    await app.close();

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthorized' });
  });

  it('protects imported source files behind service auth', async () => {
    const app = await createApp();

    const unauthenticated = await app.inject({
      method: 'GET',
      url: '/api/source/isg-studio/import-manifest.json',
    });
    expect(unauthenticated.statusCode).toBe(401);

    const token = await mintSsoSession('test-sso-secret');
    const authenticated = await app.inject({
      method: 'GET',
      url: '/api/source/isg-studio/import-manifest.json',
      headers: {
        cookie: `nz_session=${token}`,
      },
    });
    await app.close();

    expect(authenticated.statusCode).toBe(200);
    expect(authenticated.headers['content-type']).toContain('application/json');
    expect(authenticated.json()).toMatchObject({
      name: 'ISG Studio.html',
      templateFamilyCount: 15,
    });
  });
});
