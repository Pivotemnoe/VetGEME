# P2: Family / Variant / Presentation

Статус реализации: review-only, fail-closed.

## Исходный пакет

- архив: `handoff/VetGEME-master-package-2026-07-14.zip`;
- SHA-256 архива:
  `4ef2670be3e286b5a76c851389ebd3038f874c3fff0062a3e0d976a4d36d7e7c`;
- распакованный инвентарь: 106 файлов, 4 511 414 байт;
- `PACKAGE_MANIFEST.json`:
  `7c6f33dfb994480e185f05e0063946df66ca44eefb322b02b51fdeda6754148f`;
- `medical/catalog/family-registry.json`:
  `e9716b1bd4f4417e20a6aae0d5b19b0e17e4177b16bcd0d2ebfd64bb789dd64c`;
- `systems/catalog/capability-registry.json`:
  `16ff64c015a8edb302c15289540a4ed760cfc356d832bca31094f992b1da3c81`.

P2 копирует в канонический каталог только относящиеся к медицинскому индексу
83 файла: package manifest и весь каталог `medical/`. Их aggregate SHA-256 —
`c114651092f6efc16d722b6495c91dfe51e70251a8a420ea95184dcf5237e094`.
Файл `provenance.json` хранит размер и SHA-256 каждого источника. Host-проверка
`node scripts/refresh-medical-metadata-v2.mjs --compare-handoff` дополнительно
сравнивает каноническую копию с распакованным пакетом и архивной identity.
Docker-проверка не зависит от пользовательского `handoff/`.

## Runtime-контракт

`content/registry.json` регистрирует
`vetgeme-medical-family-registry@2026.07.14.3` отдельно от неизменённого
`tier-01-v2@2026.07.12.2`.

Loader проверяет package identity, provenance, family registry, все 39 family
JSON, version/status, species, capabilities, safe route, source URL, точные
суммы 39/215/645 и составные ID. Индексы:

- `familiesByKey`: `familyId@familyVersion`;
- `variantsByKey`: family key + `variantId`;
- `presentationsByKey`: variant key + `presentationId`.

Variant/presentation не получают придуманных version/status: отсутствующие в
source поля остаются `null`, а family version/status записаны отдельно как
унаследованный review-контекст. Production gate требует собственные approved
status/version и отдельный production flag, поэтому текущий production pool
равен нулю.

## Совместимость с 30 карточками

`compatibility/tier-01-v2.json` генерируется только из существующих
`family + caseId + complaintId`. Он не содержит master family/variant/
presentation mapping. Ref выбранной жалобы вычисляется при load/hydration.

Новые refs не сохраняются. Не изменены:

- generator save v6;
- tier game save v5;
- compact visit schema v1;
- content pack ID/version/hash текущих 30 карточек;
- seeded generator selection и порядок random-вызовов;
- current и legacy-v1.

10 multi-diagnosis bundles остаются `pending_content`, с
`automaticPairingAllowed:false` и `approvedClinicalContent:null`.

## Source gate

Рекурсивный validator проверяет каждое присутствующее поле `source`. Разрешены
семь первичных источников, включая `measurement`. Три существующих
`plan_steps` допускаются только как legacy metadata по точному пути
`planOptions[].longitudinalCare.homeFrequency`; в другом месте они блокируются.

## Статическая поставка

В runtime входят 43 зарегистрированных JSON master-пакета: package manifest,
provenance, compatibility, family registry и 39 family JSON. Медицинские
Markdown, `handoff/` и незарегистрированные файлы не входят в static dist и
закрыты nginx allow-list.

## Rollback

P2 не мигрирует и не перезаписывает сохранения, поэтому data rollback не нужен.
Безопасный code rollback состоит из удаления medical registration и P2 runtime
module/script entrypoints вместе с каноническим `content/medical-packs/...`.
После rollback текущие 30 карточек снова загружаются по прежнему pack identity;
v6/v5/compact-v1 сохранения продолжают гидратироваться теми же ID.

Нельзя откатывать P2 частично, оставляя ссылку loader/index на удалённый registry
или family JSON: registry-first loader намеренно остановится fail-closed.

## Условия будущей активации

Master-варианты могут стать selectable только отдельной P8-работой после:

1. независимого ветеринарного `approved`;
2. собственного машиночитаемого version/status для variant и presentation;
3. полного runtime clinical contract, а не парсинга Markdown;
4. явного activation/crosswalk manifest;
5. отдельного решения о snapshot и миграции сохранений.

Известные границы исходного пакета перечислены отдельно в
`reports/MEDICAL_CATALOG_V2_GAPS.md`.
