# Auth Provider API

## Overview

The Auth Provider API provides endpoints for managing credentials for LLM providers. It enables secure storage, retrieval, and management of authentication tokens, API keys, and other sensitive credentials required for accessing various language model services.

## Authentication

All credential management endpoints require authentication using a Bearer token:

```http
Authorization: Bearer {token}
```

The token can be either:
- The admin token (set via MARVIN_ADMIN_TOKEN environment variable)
- A valid session token created through the authentication system

## Base URL

All endpoints are prefixed with: `/api/v1/auth`

## Endpoints

### Store Provider Credentials

```http
POST /providers
```

Stores credentials for a specific LLM provider.

#### Request Body

```json
{
  "provider_id": "string",
  "provider_type": "string",
  "credentials": {
    "property1": "string",
    "property2": "string"
  }
}
```

| Field         | Type   | Description                                               |
|---------------|--------|-----------------------------------------------------------|
| provider_id   | string | Unique identifier for the provider                        |
| provider_type | string | Type of provider (e.g., "anthropic", "ollama")           |
| credentials   | object | Provider-specific credentials (API keys, configuration)   |

#### Response

```json
{
  "success": true,
  "data": {
    "provider_id": "string"
  },
  "error": null,
  "metadata": {
    "timestamp": "string"
  }
}
```

#### Status Codes

| Code | Description                                |
|------|--------------------------------------------|
| 201  | Credentials successfully stored            |
| 400  | Invalid provider data                      |
| 401  | Authentication token invalid or missing    |
| 500  | Server error                               |

#### Example

```bash
curl -X POST http://localhost:8000/api/v1/auth/providers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-admin-token" \
  -d '{
    "provider_id": "anthropic",
    "provider_type": "anthropic",
    "credentials": {
      "api_key": "your-api-key",
      "api_base": "https://api.anthropic.com/v1",
      "model": "claude-3-opus-20240229"
    }
  }'
```

### List Providers

```http
GET /providers
```

Lists all providers with stored credentials.

#### Response

```json
{
  "success": true,
  "data": {
    "provider-id-1": {
      "provider_id": "string",
      "provider_type": "string",
      "created": "number",
      "modified": "number",
      "size": "number"
    },
    "provider-id-2": {
      "provider_id": "string",
      "provider_type": "string",
      "created": "number",
      "modified": "number",
      "size": "number"
    }
  },
  "error": null,
  "metadata": {
    "timestamp": "string"
  }
}
```

#### Status Codes

| Code | Description                             |
|------|-----------------------------------------|
| 200  | Success                                 |
| 401  | Authentication token invalid or missing |
| 500  | Server error                            |

#### Example

```bash
curl -X GET http://localhost:8000/api/v1/auth/providers \
  -H "Authorization: Bearer your-admin-token"
```

### Get Provider Credentials

```http
GET /providers/{provider_id}
```

Retrieves metadata about stored credentials for a specific provider.

#### Path Parameters

| Parameter   | Type   | Description                     |
|-------------|--------|---------------------------------|
| provider_id | string | ID of the provider to retrieve  |

#### Response

```json
{
  "success": true,
  "data": {
    "provider_id": "string",
    "provider_type": "string",
    "metadata": {
      "created_at": "number",
      "updated_at": "number"
    },
    "credential_keys": ["string"]
  },
  "error": null,
  "metadata": {
    "timestamp": "string"
  }
}
```

The response includes metadata and a list of credential keys, but not the actual sensitive values.

#### Status Codes

| Code | Description                             |
|------|-----------------------------------------|
| 200  | Success                                 |
| 401  | Authentication token invalid or missing |
| 404  | Provider not found                      |
| 500  | Server error                            |

#### Example

```bash
curl -X GET http://localhost:8000/api/v1/auth/providers/anthropic-main \
  -H "Authorization: Bearer your-admin-token"
```

### Remove Provider Credentials

```http
DELETE /providers/{provider_id}
```

Removes stored credentials for a specific provider.

#### Path Parameters

| Parameter   | Type   | Description                   |
|-------------|--------|-------------------------------|
| provider_id | string | ID of the provider to remove  |

#### Response

```json
{
  "success": true,
  "data": null,
  "error": null,
  "metadata": {
    "timestamp": "string"
  }
}
```

#### Status Codes

| Code | Description                             |
|------|-----------------------------------------|
| 200  | Success                                 |
| 401  | Authentication token invalid or missing |
| 404  | Provider not found                      |
| 500  | Server error                            |

#### Example

```bash
curl -X DELETE http://localhost:8000/api/v1/auth/providers/anthropic-main \
  -H "Authorization: Bearer your-admin-token"
```

### List Provider Types

```http
GET /provider-types
```

Lists all available provider types supported by the system.

#### Response

```json
{
  "success": true,
  "data": {
    "local": "LocalAuthProvider",
    "anthropic": "AnthropicAuthProvider",
    "ollama": "OllamaAuthProvider"
  },
  "error": null,
  "metadata": {
    "timestamp": "string"
  }
}
```

#### Status Codes

| Code | Description   |
|------|---------------|
| 200  | Success       |
| 500  | Server error  |

#### Example

```bash
curl -X GET http://localhost:8000/api/v1/auth/provider-types
```

### Validate Auth Token

```http
POST /validate
```

Validates an authentication token.

#### Request Body

```json
{
  "session_token": "string"
}
```

#### Response

```json
{
  "success": true,
  "data": null,
  "error": null,
  "metadata": {
    "timestamp": "string"
  }
}
```

If the token is invalid, `success` will be `false` and an error will be included.

#### Status Codes

| Code | Description  |
|------|--------------|
| 200  | Success      |
| 400  | Bad request  |
| 500  | Server error |

#### Example

```bash
curl -X POST http://localhost:8000/api/v1/auth/validate \
  -H "Content-Type: application/json" \
  -d '{"session_token": "your-admin-token"}'
```

## Error Responses

All endpoints return errors in a standardized format:

```json
{
  "success": false,
  "data": null,
  "error": {
    "error_code": "string",
    "message": "string",
    "details": {
      "property1": "string",
      "property2": "string"
    }
  },
  "metadata": {
    "timestamp": "string"
  }
}
```

### Common Error Codes

| Error Code           | Description                                    |
|----------------------|------------------------------------------------|
| VALIDATION_ERROR     | Input validation failed                        |
| AUTHORIZATION_ERROR  | Authentication token invalid or missing        |
| NOT_FOUND_ERROR      | Requested resource not found                   |
| STORAGE_ERROR        | Error storing or retrieving credentials        |
| INTERNAL_ERROR       | Unexpected server error                        |

## Data Models

### CredentialStore

```json
{
  "provider_id": "string",
  "provider_type": "string",
  "credentials": {
    "property1": "string",
    "property2": "string"
  }
}
```

### ProviderInfo

```json
{
  "provider_id": "string",
  "provider_type": "string",
  "created": "number",
  "modified": "number",
  "size": "number"
}
```

### SessionAuth

```json
{
  "session_token": "string"
}
```

## Implementation Notes

- All sensitive credential data is encrypted at rest
- The system supports multiple provider types through a provider registry
- Credentials are stored with metadata to track creation and modification times
- Authentication uses a Bearer token scheme with admin token support