import { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { CONFIG_EDITOR_INSTRUCTIONS, CONFIG_EDITOR_TOOL_SPECS } from '@/lib/config-editor-agent';
import { getActiveConfig, addConfig, validateConfigShape, type IndustryConfig } from '@/lib/industry-config';

function jsonResponse(body: any, init: { status?: number } = {}) {
  const status = init.status ?? 200;
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function cloneConfig(cfg: IndustryConfig): IndustryConfig {
  return JSON.parse(JSON.stringify(cfg));
}

function persistConfig(cfg: IndustryConfig) {
  validateConfigShape(cfg);
  addConfig(cfg, true);
  return cfg;
}

export async function GET() {
  const active = getActiveConfig();
  return jsonResponse({
    instructions: CONFIG_EDITOR_INSTRUCTIONS,
    tools: CONFIG_EDITOR_TOOL_SPECS,
    config: { id: active.id, name: active.name }
  });
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const tool = payload?.tool;
    const args = payload?.args ?? {};
    if (!tool || typeof tool !== 'string') {
      return jsonResponse({ error: 'invalid_tool' }, { status: 400 });
    }
    const active = getActiveConfig();

    switch (tool) {
      case 'getPrompt': {
        return jsonResponse({ prompt: active.prompt });
      }
      case 'setPrompt': {
        const prompt = args?.prompt;
        if (typeof prompt !== 'string' || !prompt.trim()) {
          return jsonResponse({ error: 'invalid_prompt' }, { status: 400 });
        }
        const updated = cloneConfig(active);
        updated.prompt = prompt;
        persistConfig(updated);
        return jsonResponse({ prompt: updated.prompt });
      }
      case 'getScenarios': {
        return jsonResponse({
          defaultScenarioId: active.defaultScenarioId,
          scenarios: active.scenarios
        });
      }
      case 'addScenario': {
        const { id, name, text, makeDefault } = args || {};
        if (typeof name !== 'string' || !name.trim() || typeof text !== 'string' || !text.trim()) {
          return jsonResponse({ error: 'invalid_scenario' }, { status: 400 });
        }
        const updated = cloneConfig(active);
        const nextId = typeof id === 'string' && id.trim() ? id.trim() : `scenario_${randomUUID()}`;
        if (updated.scenarios.some(s => s.id === nextId)) {
          return jsonResponse({ error: 'scenario_id_exists' }, { status: 400 });
        }
        const scenario = { id: nextId, name: name.trim(), text: text.trim() };
        updated.scenarios.push(scenario);
        if (makeDefault) {
          updated.defaultScenarioId = scenario.id;
        }
        persistConfig(updated);
        return jsonResponse({ scenario, defaultScenarioId: updated.defaultScenarioId });
      }
      case 'updateScenario': {
        const { id, name, text, makeDefault } = args || {};
        if (typeof id !== 'string' || !id.trim()) {
          return jsonResponse({ error: 'missing_id' }, { status: 400 });
        }
        const updated = cloneConfig(active);
        const target = updated.scenarios.find(s => s.id === id);
        if (!target) {
          return jsonResponse({ error: 'scenario_not_found' }, { status: 404 });
        }
        if (typeof name === 'string' && name.trim()) target.name = name.trim();
        if (typeof text === 'string' && text.trim()) target.text = text.trim();
        if (makeDefault === true) {
          updated.defaultScenarioId = target.id;
        }
        persistConfig(updated);
        return jsonResponse({ scenario: target, defaultScenarioId: updated.defaultScenarioId });
      }
      case 'deleteScenario': {
        const { id, replacementDefaultId } = args || {};
        if (typeof id !== 'string' || !id.trim()) {
          return jsonResponse({ error: 'missing_id' }, { status: 400 });
        }
        const updated = cloneConfig(active);
        if (updated.scenarios.length <= 1) {
          return jsonResponse({ error: 'cannot_delete_last_scenario' }, { status: 400 });
        }
        const index = updated.scenarios.findIndex(s => s.id === id);
        if (index === -1) {
          return jsonResponse({ error: 'scenario_not_found' }, { status: 404 });
        }
        const removed = updated.scenarios.splice(index, 1)[0];
        if (updated.defaultScenarioId === removed.id) {
          if (typeof replacementDefaultId === 'string') {
            const replacement = updated.scenarios.find(s => s.id === replacementDefaultId);
            if (replacement) {
              updated.defaultScenarioId = replacement.id;
            } else {
              updated.defaultScenarioId = updated.scenarios[0].id;
            }
          } else {
            updated.defaultScenarioId = updated.scenarios[0].id;
          }
        }
        persistConfig(updated);
        return jsonResponse({ defaultScenarioId: updated.defaultScenarioId, remaining: updated.scenarios });
      }
      case 'getFunctions': {
        return jsonResponse({ tools: active.tools });
      }
      case 'addFunction': {
        const { name, description, argSchema, resultSchema, sampleResult, insertIndex } = args || {};
        if (typeof name !== 'string' || !name.trim() || typeof description !== 'string' || !description.trim()) {
          return jsonResponse({ error: 'invalid_tool' }, { status: 400 });
        }
        if (typeof argSchema !== 'object' || argSchema === null || Array.isArray(argSchema)) {
          return jsonResponse({ error: 'invalid_argSchema' }, { status: 400 });
        }
        if (typeof resultSchema !== 'object' || resultSchema === null || Array.isArray(resultSchema)) {
          return jsonResponse({ error: 'invalid_resultSchema' }, { status: 400 });
        }
        const updated = cloneConfig(active);
        if (updated.tools.some(t => t.name === name.trim())) {
          return jsonResponse({ error: 'tool_name_exists' }, { status: 400 });
        }
        const toolDef: IndustryConfig['tools'][number] = {
          name: name.trim(),
          description: description.trim(),
          argSchema,
          resultSchema,
          sampleResult
        };
        if (typeof insertIndex === 'number' && insertIndex >= 0 && insertIndex <= updated.tools.length) {
          updated.tools.splice(insertIndex, 0, toolDef);
        } else {
          updated.tools.push(toolDef);
        }
        persistConfig(updated);
        return jsonResponse({ tool: toolDef });
      }
      case 'updateFunction': {
        const { name, newName, description, argSchema, resultSchema, sampleResult } = args || {};
        if (typeof name !== 'string' || !name.trim()) {
          return jsonResponse({ error: 'missing_name' }, { status: 400 });
        }
        const updated = cloneConfig(active);
        const target = updated.tools.find(t => t.name === name.trim());
        if (!target) {
          return jsonResponse({ error: 'tool_not_found' }, { status: 404 });
        }
        if (typeof newName === 'string' && newName.trim()) {
          const nextName = newName.trim();
          if (nextName !== target.name && updated.tools.some(t => t.name === nextName)) {
            return jsonResponse({ error: 'tool_name_exists' }, { status: 400 });
          }
          target.name = nextName;
        }
        if (typeof description === 'string' && description.trim()) target.description = description.trim();
        if (argSchema !== undefined) {
          if (typeof argSchema !== 'object' || argSchema === null || Array.isArray(argSchema)) {
            return jsonResponse({ error: 'invalid_argSchema' }, { status: 400 });
          }
          target.argSchema = argSchema;
        }
        if (resultSchema !== undefined) {
          if (typeof resultSchema !== 'object' || resultSchema === null || Array.isArray(resultSchema)) {
            return jsonResponse({ error: 'invalid_resultSchema' }, { status: 400 });
          }
          target.resultSchema = resultSchema;
        }
        if (sampleResult !== undefined) {
          target.sampleResult = sampleResult;
        }
        persistConfig(updated);
        return jsonResponse({ tool: target });
      }
      case 'deleteFunction': {
        const { name } = args || {};
        if (typeof name !== 'string' || !name.trim()) {
          return jsonResponse({ error: 'missing_name' }, { status: 400 });
        }
        const updated = cloneConfig(active);
        if (updated.tools.length <= 1) {
          return jsonResponse({ error: 'cannot_delete_last_tool' }, { status: 400 });
        }
        const index = updated.tools.findIndex(t => t.name === name.trim());
        if (index === -1) {
          return jsonResponse({ error: 'tool_not_found' }, { status: 404 });
        }
        updated.tools.splice(index, 1);
        persistConfig(updated);
        return jsonResponse({ remaining: updated.tools });
      }
      default:
        return jsonResponse({ error: 'unsupported_tool' }, { status: 400 });
    }
  } catch (err: any) {
    return jsonResponse({ error: err?.message || 'unknown_error' }, { status: 500 });
  }
}
