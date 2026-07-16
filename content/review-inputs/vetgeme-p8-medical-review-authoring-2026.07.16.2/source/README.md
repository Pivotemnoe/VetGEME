# VetGEME P8 — медицинский review и человеческий язык

Этот пакет повторно проверяет medical authoring 39/215/645 и задаёт единый
контракт внешнего ветеринарного решения. Он не активирует заболевания.

Первый аудит выявил 5 976 дефектов. В версии `2026.07.16.40`
они исправлены: source audit показывает 0 P0/P1, а расширенный
языковой gate проверил 9 847 видимых игроку полей без ошибок.
Пакет всё ещё review-only только по одной причине: нет независимого
ветеринарного решения по точным версиям.

## Что готово

- точный machine-readable аудит 39/215/645 с 0 P0/P1;
- 1 864 конкретных состояния результатов исследований без пустых полей;
- репрезентативная матрица диалогов по одному случаю из каждого семейства;
- fail-closed правила русского player-facing текста;
- естественная разговорная библиотека для 12 характеров владельцев;
- человеческие реплики врача для объяснения неопределённости, исследования,
  поэтапного плана, отказа, срочного направления и проверки понимания;
- четыре редких смешных события, запрещённых при emergency;
- шаблон решений независимого ветеринарного reviewer.

## Что не готово

- внешнее ветеринарное одобрение точных версий;
- activation manifest;
- подключение 39 семейств к production generator.

## Запуск

```sh
MEDICAL_SOURCE_ROOT=content/review-inputs/vetgeme-medical-production-authoring-2026.07.16.40/source MEDICAL_EXPECTED_VERSION=2026.07.16.40 node p8-medical-review-authoring/scripts/audit-p8-source.mjs --require-clean
node p8-medical-review-authoring/scripts/validate-p8-display-language.mjs
node p8-medical-review-authoring/scripts/validate-human-dialogues.mjs --require-clean
node p8-medical-review-authoring/scripts/build-p8-package.mjs
node p8-medical-review-authoring/scripts/validate-p8-package.mjs
```

Ожидаемый итог: source audit `reviewable`, display audit `passed`,
dialogue library `pass`, package validation `pass`, activation `false`.
