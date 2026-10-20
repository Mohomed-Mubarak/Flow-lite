// OpenAPI 3.1 description of /api/v1. Import it in n8n, Postman, or give the URL to an agent.
const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
const err = { description: 'Error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
const json = (schema: any, description = 'OK') => ({ description, content: { 'application/json': { schema } } });
const body = (schema: any) => ({ required: true, content: { 'application/json': { schema } } });
const ref = (n: string) => ({ $ref: `#/components/schemas/${n}` });
const arr = (items: any) => ({ type: 'array', items });
const sec = [{ bearerAuth: [] }, { apiKeyHeader: [] }];
const op = (summary: string, scope: string, extra: any = {}) => ({
  summary, security: sec, description: `Needs a key with "${scope}" access or higher.`,
  ...extra, responses: { ...extra.responses, '401': err, '403': err, '400': err },
});

export function openapi(base: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Flowlite API', version: '1.0.0',
      description: 'Manage and run Flowlite workflows from other tools (n8n, scripts, agents). Create a key on the API page of your Flowlite and send it as "Authorization: Bearer fl_...". The same operations are available as MCP tools at /api/mcp.',
    },
    servers: [{ url: base }],
    security: sec,
    paths: {
      '/api/v1/ping': { get: op('Check the key', 'read', { operationId: 'ping', responses: { '200': json({ type: 'object', properties: { ok: { type: 'boolean' }, key: { type: 'object', properties: { name: { type: 'string' }, scope: { type: 'string' } } } } }) } }) },
      '/api/v1/workflows': {
        get: op('List workflows', 'read', { operationId: 'listWorkflows', parameters: [{ name: 'active', in: 'query', schema: { type: 'boolean' } }], responses: { '200': json(arr(ref('WorkflowSummary'))) } }),
        post: op('Create a workflow', 'full', { operationId: 'createWorkflow', requestBody: body(ref('WorkflowInput')), responses: { '201': json(ref('Workflow')) } }),
      },
      '/api/v1/workflows/{id}': {
        get: op('Get a workflow', 'read', { operationId: 'getWorkflow', parameters: [idParam], responses: { '200': json(ref('Workflow')), '404': err } }),
        put: op('Update a workflow (nodes and edges replace the old ones)', 'full', { operationId: 'updateWorkflow', parameters: [idParam], requestBody: body(ref('WorkflowInput')), responses: { '200': json(ref('Workflow')), '404': err } }),
        patch: op('Update a workflow (same as PUT)', 'full', { operationId: 'patchWorkflow', parameters: [idParam], requestBody: body(ref('WorkflowInput')), responses: { '200': json(ref('Workflow')), '404': err } }),
        delete: op('Delete a workflow', 'full', { operationId: 'deleteWorkflow', parameters: [idParam], responses: { '200': json({ type: 'object', properties: { ok: { type: 'boolean' } } }), '404': err } }),
      },
      '/api/v1/workflows/{id}/run': {
        post: op('Run a workflow', 'run', {
          operationId: 'runWorkflow', parameters: [idParam],
          description: 'Needs a key with "run" access or higher. With wait=true (default) the response has the final output. With wait=false it returns an executionId straight away: poll GET /api/v1/executions/{id}. One run is limited to 60 seconds.',
          requestBody: body({ type: 'object', properties: {
            input: { type: 'object', additionalProperties: true, description: 'Trigger data. Webhook trigger: the request body. Chat trigger: {message, sessionId}. Form: field values. Manual: $json.' },
            wait: { type: 'boolean', default: true }, startNodeId: { type: 'string', description: 'Trigger node id when there are several.' },
          } }),
          responses: { '200': json(ref('RunResult')), '404': err },
        }),
      },
      '/api/v1/workflows/{id}/activate': { post: op('Activate a workflow', 'full', { operationId: 'activateWorkflow', parameters: [idParam], responses: { '200': json({ type: 'object', additionalProperties: true }) } }) },
      '/api/v1/workflows/{id}/deactivate': { post: op('Deactivate a workflow', 'full', { operationId: 'deactivateWorkflow', parameters: [idParam], responses: { '200': json({ type: 'object', additionalProperties: true }) } }) },
      '/api/v1/executions': {
        get: op('List executions', 'read', { operationId: 'listExecutions', parameters: [
          { name: 'workflowId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['success', 'error', 'running'] } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
        ], responses: { '200': json(arr(ref('ExecutionSummary'))) } }),
      },
      '/api/v1/executions/{id}': {
        get: op('Get an execution', 'read', { operationId: 'getExecution', parameters: [idParam, { name: 'full', in: 'query', description: 'Include every node input and output.', schema: { type: 'boolean' } }], responses: { '200': json(ref('Execution')), '404': err } }),
      },
      '/api/v1/node-types': {
        get: op('List node types', 'read', { operationId: 'listNodeTypes', parameters: [
          { name: 'group', in: 'query', schema: { type: 'string', enum: ['trigger', 'logic', 'data', 'app', 'ai', 'sub'] } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
        ], responses: { '200': json(arr({ type: 'object', additionalProperties: true })) } }),
      },
      '/api/v1/node-types/{type}': {
        get: op('Describe a node type and its parameters', 'read', { operationId: 'describeNodeType', parameters: [{ name: 'type', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': json({ type: 'object', additionalProperties: true }), '404': err } }),
      },
      '/api/v1/credentials': {
        get: op('List credentials (no secrets)', 'read', { operationId: 'listCredentials', responses: { '200': json(arr({ type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, type: { type: 'string' }, typeLabel: { type: 'string' } } })) } }),
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', description: 'A Flowlite API key (fl_...).' },
        apiKeyHeader: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
      },
      schemas: {
        Error: { type: 'object', properties: { error: { type: 'string' }, code: { type: 'string' } } },
        Node: { type: 'object', required: ['type'], properties: { id: { type: 'string' }, type: { type: 'string' }, name: { type: 'string' }, position: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } } }, params: { type: 'object', additionalProperties: true } } },
        Edge: { type: 'object', required: ['source', 'target'], properties: { id: { type: 'string' }, source: { type: 'string' }, target: { type: 'string' }, sourceHandle: { type: ['string', 'null'], description: 'out0, out1... Default out0.' }, targetHandle: { type: ['string', 'null'], enum: ['model', 'memory', 'tool', null], description: 'Only for sub-nodes plugged into an AI Agent.' } } },
        WorkflowInput: { type: 'object', properties: { name: { type: 'string' }, nodes: arr(ref('Node')), edges: arr(ref('Edge')), active: { type: 'boolean', description: 'Create only.' } } },
        Trigger: { type: 'object', additionalProperties: true, properties: { nodeId: { type: 'string' }, type: { type: 'string' }, name: { type: 'string' }, url: { type: 'string' }, method: { type: 'string' }, cron: { type: 'string' } } },
        WorkflowSummary: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, active: { type: 'boolean' }, updated_at: { type: 'string' }, nodeCount: { type: 'integer' }, triggers: arr(ref('Trigger')) } },
        Workflow: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, active: { type: 'boolean' }, updated_at: { type: 'string' }, nodes: arr(ref('Node')), edges: arr(ref('Edge')), triggers: arr(ref('Trigger')), warnings: arr({ type: 'string' }) } },
        NodeStatus: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, status: { type: 'string', enum: ['success', 'error', 'skipped'] }, ms: { type: 'integer' }, error: { type: 'string' } } },
        RunResult: { type: 'object', properties: { executionId: { type: 'string' }, status: { type: 'string', enum: ['success', 'error', 'running'] }, error: { type: 'string' }, output: arr({ type: 'object', additionalProperties: true }), nodes: arr(ref('NodeStatus')) } },
        ExecutionSummary: { type: 'object', properties: { id: { type: 'string' }, workflowId: { type: 'string' }, workflowName: { type: 'string' }, status: { type: 'string' }, mode: { type: 'string', description: 'manual, webhook, schedule, interval, chat, api or mcp' }, error: { type: ['string', 'null'] }, startedAt: { type: 'string' }, finishedAt: { type: ['string', 'null'] }, durationMs: { type: ['integer', 'null'] } } },
        Execution: { allOf: [ref('ExecutionSummary'), { type: 'object', properties: { output: arr({ type: 'object', additionalProperties: true }), nodes: arr(ref('NodeStatus')) } }] },
      },
    },
  };
}
