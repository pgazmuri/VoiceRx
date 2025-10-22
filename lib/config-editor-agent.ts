export const CONFIG_EDITOR_INSTRUCTIONS = `You are a collaborative voice design assistant helping teammates edit a configurable voice agent.
- Speak concisely and stay focused on editing the configuration that powers the voice agent.
- Use the available tools to inspect the current prompt, scenarios, and agent tool functions before making changes.
- When users request updates, call the appropriate mutation tool (setPrompt, addScenario, updateScenario, deleteScenario, addFunction, updateFunction, deleteFunction).
- Keep scenario IDs unique; if you add a scenario without an id, let the tool generate one.
- Keep tool names unique and descriptive. Do not remove the final remaining function or scenario.
- After any change, re-check state so you can confirm the update with the user.
- Never fabricate results—always rely on the provided tools.`;

export const CONFIG_EDITOR_TOOL_SPECS = [
  {
    type: 'function',
    name: 'getPrompt',
    description: 'Fetch the full system prompt for the active industry configuration.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    result_schema: {
      type: 'object',
      required: ['prompt'],
      properties: { prompt: { type: 'string' } }
    }
  },
  {
    type: 'function',
    name: 'setPrompt',
    description: 'Replace the system prompt for the active configuration. Provide the full prompt text.',
    parameters: {
      type: 'object',
      required: ['prompt'],
      properties: {
        prompt: { type: 'string', description: 'The complete prompt instructions to store.' }
      },
      additionalProperties: false
    },
    result_schema: {
      type: 'object',
      required: ['prompt'],
      properties: { prompt: { type: 'string' } }
    }
  },
  {
    type: 'function',
    name: 'getScenarios',
    description: 'List all scenarios for the active configuration, including which scenario is the default.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    result_schema: {
      type: 'object',
      required: ['scenarios', 'defaultScenarioId'],
      properties: {
        defaultScenarioId: { type: 'string' },
        scenarios: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'name', 'text'],
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              text: { type: 'string' }
            }
          }
        }
      }
    }
  },
  {
    type: 'function',
    name: 'addScenario',
    description: 'Create a new scenario. If makeDefault is true, the scenario becomes the default.',
    parameters: {
      type: 'object',
      required: ['name', 'text'],
      properties: {
        id: { type: 'string', description: 'Optional explicit scenario ID. Leave blank to auto-generate.' },
        name: { type: 'string' },
        text: { type: 'string' },
        makeDefault: { type: 'boolean', description: 'Set true to make this the default scenario.' }
      },
      additionalProperties: false
    },
    result_schema: {
      type: 'object',
      required: ['scenario', 'defaultScenarioId'],
      properties: {
        scenario: {
          type: 'object',
          required: ['id', 'name', 'text'],
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            text: { type: 'string' }
          }
        },
        defaultScenarioId: { type: 'string' }
      }
    }
  },
  {
    type: 'function',
    name: 'updateScenario',
    description: 'Update name and/or text for a scenario. Pass makeDefault true to mark it default.',
    parameters: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        text: { type: 'string' },
        makeDefault: { type: 'boolean' }
      },
      additionalProperties: false
    },
    result_schema: {
      type: 'object',
      required: ['scenario', 'defaultScenarioId'],
      properties: {
        scenario: {
          type: 'object',
          required: ['id', 'name', 'text'],
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            text: { type: 'string' }
          }
        },
        defaultScenarioId: { type: 'string' }
      }
    }
  },
  {
    type: 'function',
    name: 'deleteScenario',
    description: 'Delete a scenario by id. Optionally set replacementDefaultId if removing the default scenario.',
    parameters: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string' },
        replacementDefaultId: { type: 'string', description: 'Optional scenario id to promote as default if needed.' }
      },
      additionalProperties: false
    },
    result_schema: {
      type: 'object',
      required: ['defaultScenarioId', 'remaining'],
      properties: {
        defaultScenarioId: { type: 'string' },
        remaining: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'name', 'text'],
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              text: { type: 'string' }
            }
          }
        }
      }
    }
  },
  {
    type: 'function',
    name: 'getFunctions',
    description: 'List all tool functions that the agent can call, including schemas and sample results.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    result_schema: {
      type: 'object',
      required: ['tools'],
      properties: {
        tools: {
          type: 'array',
          items: {
            type: 'object',
            required: ['name', 'description', 'argSchema', 'resultSchema'],
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              argSchema: { type: ['object', 'array', 'string'] },
              resultSchema: { type: ['object', 'array', 'string'] },
              sampleResult: { type: ['object', 'array', 'string', 'number', 'boolean', 'null'] }
            }
          }
        }
      }
    }
  },
  {
    type: 'function',
    name: 'addFunction',
    description: 'Add a new tool definition. Provide argSchema/resultSchema as JSON objects.',
    parameters: {
      type: 'object',
      required: ['name', 'description', 'argSchema', 'resultSchema'],
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        argSchema: { type: 'object' },
        resultSchema: { type: 'object' },
        sampleResult: { type: ['object', 'array', 'string', 'number', 'boolean', 'null'] },
        insertIndex: { type: 'integer', minimum: 0, description: 'Optional index to insert the tool at.' }
      },
      additionalProperties: false
    },
    result_schema: {
      type: 'object',
      required: ['tool'],
      properties: {
        tool: {
          type: 'object',
          required: ['name', 'description', 'argSchema', 'resultSchema'],
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            argSchema: { type: 'object' },
            resultSchema: { type: 'object' },
            sampleResult: { type: ['object', 'array', 'string', 'number', 'boolean', 'null'] }
          }
        }
      }
    }
  },
  {
    type: 'function',
    name: 'updateFunction',
    description: 'Update an existing tool definition. You may rename the tool and adjust schemas or sample result.',
    parameters: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', description: 'Current tool name to update.' },
        newName: { type: 'string', description: 'Optional new tool name.' },
        description: { type: 'string' },
        argSchema: { type: 'object' },
        resultSchema: { type: 'object' },
        sampleResult: { type: ['object', 'array', 'string', 'number', 'boolean', 'null'] }
      },
      additionalProperties: false
    },
    result_schema: {
      type: 'object',
      required: ['tool'],
      properties: {
        tool: {
          type: 'object',
          required: ['name', 'description', 'argSchema', 'resultSchema'],
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            argSchema: { type: 'object' },
            resultSchema: { type: 'object' },
            sampleResult: { type: ['object', 'array', 'string', 'number', 'boolean', 'null'] }
          }
        }
      }
    }
  },
  {
    type: 'function',
    name: 'deleteFunction',
    description: 'Remove a tool definition by name. Will fail if it would remove the final tool.',
    parameters: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string' }
      },
      additionalProperties: false
    },
    result_schema: {
      type: 'object',
      required: ['remaining'],
      properties: {
        remaining: {
          type: 'array',
          items: {
            type: 'object',
            required: ['name', 'description', 'argSchema', 'resultSchema'],
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              argSchema: { type: 'object' },
              resultSchema: { type: 'object' },
              sampleResult: { type: ['object', 'array', 'string', 'number', 'boolean', 'null'] }
            }
          }
        }
      }
    }
  }
] as const;

export const CONFIG_EDITOR_MUTATION_TOOLS = [
  'setPrompt',
  'addScenario',
  'updateScenario',
  'deleteScenario',
  'addFunction',
  'updateFunction',
  'deleteFunction'
] as const;
