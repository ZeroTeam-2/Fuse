## ADDED Requirements

### Requirement: Извлечение auth из OpenAPI security schemes
При импорте и повторном импорте OpenAPI-спецификации система SHALL извлекать описание аутентификации из `components.securitySchemes` с учётом корневого и/или operation-level `security` и сохранять его на приложении как auth hint для конструктора сценариев.

Поддерживаемые схемы:
- `type: http` и `scheme: bearer` → hint с заголовком `Authorization`, форматом значения Bearer, меткой вроде «Bearer Token»;
- `type: apiKey` и `in: header` → hint с именем заголовка из схемы, форматом raw, меткой вроде «API Key».

Если поддерживаемых схем нет (в том числе только OAuth2 / openIdConnect / apiKey в query или cookie), система MUST NOT выставлять auth hint (поле отсутствует) — UI сценария использует ручной fallback заголовков. При нескольких кандидатах система MUST выбрать первый поддерживаемый scheme из активного security requirement, иначе первый поддерживаемый из `securitySchemes`.

Auth hint MUST сохраняться вместе с прочими производными данными приложения и MUST быть доступен клиенту при чтении приложения (без секретов — только scheme/header/format/required).

#### Scenario: Импорт Bearer security
- **WHEN** спецификация объявляет `http` bearer scheme и операции ссылаются на неё в `security`
- **THEN** у созданного приложения есть auth hint с `Authorization` и форматом Bearer

#### Scenario: Импорт API Key в заголовке
- **WHEN** спецификация объявляет `apiKey` с `in: header` и `name: X-Api-Key`
- **THEN** у приложения auth hint с заголовком `X-Api-Key` и форматом raw

#### Scenario: Спека без security
- **WHEN** спецификация не содержит поддерживаемых security schemes
- **THEN** приложение создаётся без auth hint, импорт не падает
