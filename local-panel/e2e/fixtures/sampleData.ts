/**
 * Sample data for E2E tests.
 * Used to seed the application state via IPC before running UI assertions.
 */

export const sampleMapping = {
    id: "map-e2e-1",
    name: "E2E Test Service",
    domain: "api-test.localhost",
    target: "http://127.0.0.1:3456",
    enabled: true,
    createdAt: Date.now(),
};

export const sampleMapping2 = {
    id: "map-e2e-2",
    name: "E2E Disabled Service",
    domain: "disabled.localhost",
    target: "http://127.0.0.1:9999",
    enabled: false,
    createdAt: Date.now(),
};

export const sampleProxyRule = {
    id: "rule-e2e-1",
    name: "Block Ads",
    type: "block",
    urlPattern: ".*ads\\.example\\.com.*",
    useRegex: true,
    enabled: true,
    createdAt: Date.now(),
};

export const sampleProxyRule2 = {
    id: "rule-e2e-2",
    name: "Redirect Legacy",
    type: "redirect",
    urlPattern: "/legacy/api",
    useRegex: false,
    targetUrl: "/v2/api",
    enabled: true,
    createdAt: Date.now(),
};

export const sampleMockRule = {
    id: "mock-e2e-1",
    name: "GET Users Mock",
    method: "GET",
    urlPattern: "/api/users",
    useRegex: false,
    enabled: true,
    responseStatus: 200,
    responseHeaders: { "content-type": "application/json" },
    responseBody: JSON.stringify([{ id: 1, name: "Test User" }]),
    responseDelay: 0,
    createdAt: Date.now(),
};

export const sampleMockRule2 = {
    id: "mock-e2e-2",
    name: "POST Users Mock (Error)",
    method: "POST",
    urlPattern: "/api/users",
    useRegex: false,
    enabled: true,
    responseStatus: 422,
    responseHeaders: { "content-type": "application/json" },
    responseBody: JSON.stringify({ error: "Validation failed", fields: ["email"] }),
    responseDelay: 0,
    createdAt: Date.now(),
};

export const sampleRequest = {
    id: "req-e2e-1",
    name: "Get All Users",
    method: "GET",
    url: "http://api-test.localhost/api/users",
    headers: { "accept": "application/json" },
    body: "",
    createdAt: Date.now(),
};

export const sampleRequest2 = {
    id: "req-e2e-2",
    name: "Create User",
    method: "POST",
    url: "http://api-test.localhost/api/users",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "New User", email: "new@example.com" }),
    createdAt: Date.now(),
};

export const sampleEnvironment = {
    id: "env-e2e-1",
    name: "E2E Dev",
    variables: [
        { key: "baseUrl", value: "http://localhost:3456" },
        { key: "apiKey", value: "test-key-123" },
    ],
    createdAt: Date.now(),
};

export const sampleEnvironment2 = {
    id: "env-e2e-2",
    name: "E2E Prod",
    variables: [
        { key: "baseUrl", value: "https://api.example.com" },
        { key: "apiKey", value: "prod-key-456" },
    ],
    createdAt: Date.now(),
};

export const sampleWebhook = {
    id: "wh-e2e-1",
    name: "Order Webhook",
    urlSuffix: "orders",
    createdAt: Date.now(),
};

export const sampleFolder = {
    id: "folder-e2e-1",
    name: "E2E Tests",
    parentId: null,
    createdAt: Date.now(),
};
