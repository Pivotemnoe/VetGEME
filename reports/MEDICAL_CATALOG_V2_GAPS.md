# Medical Catalog v2 — границы P2

Дата фиксации: 2026-07-15.

Источник импортирован без изменения медицинского текста как
`vetgeme-master-package@2026.07.14.2` / `vetgeme-medical-family-registry@2026.07.14.3`.
Машиночитаемый объём: 39 семейств, 215 вариантов и 645 составных presentation ID.

## Что машиночитаемо сейчас

- семейство: `familyId`, `familyVersion`, status, species, capabilities, safe route;
- вариант: ID, заголовок и три presentation ID;
- presentation: только ID внутри конкретного family + variant;
- источники семейства: список HTTPS URL;
- production-флаг семейства: `generatorEligible`.

Индексы P2 используют составной ключ
`familyId@familyVersion + variantId + presentationId`. Один presentation ID нельзя
считать глобально уникальным.

## Что отсутствует и не синтезируется

1. У variant и presentation нет собственных version, review status и
   `generatorEligible`. Нормализованный индекс показывает эти поля как `null` и
   хранит family status/version только как унаследованный review-контекст. Gate
   не считает наследование достаточным для production.
2. Полная клиническая структура variant/presentation находится в Markdown, но не
   представлена в family JSON. P2 не превращает свободный Markdown в медицинские
   runtime-поля.
3. Нет авторского crosswalk между 30 карточками `tier-01-v2` и master
   family/variant/presentation. Compatibility namespace содержит только
   механически выводимые старые `family + caseId + complaintId`; master ID в нём
   отсутствуют.
4. Research ID и capability ID принадлежат разным пространствам. Их медицинское
   сопоставление относится к P3 и не угадывается в P2.
5. Family JSON и соседний Markdown нельзя считать взаимозаменяемыми источниками.
   В частности, JSON `infectious_feline_major` содержит дополнительный URL Merck
   по FeLV, которого нет в sibling Markdown. Оба файла сохранены байт-в-байт.

## Следствие для activation

- Все 39 family имеют `source_checked_pending_veterinary_review` и
  `generatorEligible:false`.
- Review-index доступен для проверки; production pool равен нулю.
- Текущие 30 карточек продолжают быть единственным selectable pool режима
  `tier-01-v2`.
- 10 multi-diagnosis bundles остаются `pending_content`, без автоматического
  pairing и без утверждённого clinical content.
- Для активации master-вариантов нужен отдельный P8-пакет: ветеринарное
  `approved`, полный машиночитаемый variant/presentation contract, явный
  crosswalk/activation manifest и отдельное решение по save migration.

P2 не меняет generator save v6, game save v5 или compact visit schema v1: новые
refs вычисляются при load/hydration и не записываются в сохранение.
