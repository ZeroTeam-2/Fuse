## ADDED Requirements

### Requirement: Проверяемость связки OpenSpec и GitHub
Связка процесса разработки SHALL позволять проверить полный цикл на служебном change. Push ветки `change/<id>` MUST приводить к созданию issue и чернового PR автоматикой, без ручных действий.

#### Scenario: Бутстрап заводит issue и PR
- **WHEN** ветка `change/smoke-test-flow` впервые запушена в origin
- **THEN** появляется issue с лейблом `change:smoke-test-flow` и черновой PR в `develop`

#### Scenario: Служебный change удаляется
- **WHEN** проверка автоматики завершена
- **THEN** issue и PR закрываются, а ветка удаляется без архивирования в `openspec/specs/`
