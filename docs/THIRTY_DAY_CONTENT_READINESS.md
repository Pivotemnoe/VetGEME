# 30-Day Campaign Content Readiness Contract

Дата: 2026-07-13.

## Назначение

Этот документ фиксирует контракт контента для 30-дневной кампании `tier-01-v2`. Он не является расписанием пациентов и не разрешает генератору сочинять медицинские сведения. Номер дня ограничивает доступные механики, сложность, обучение, обязательные события и допустимый проверенный контент; конкретный поток формируется детерминированным генератором спроса и существующим Day Planner.

`current` остается production default. `tier-01-v2` остается opt-in. Сочетанные случаи не включаются, пока соответствующий bundle не получит собственный полностью утвержденный контент.

## Мини-аудит перед задачей

| Область | Статус | Фактическое состояние |
|---|---|---|
| Дни 1-7 | partially implemented | `seven-day-plan.json` задает диапазоны, обучение, follow-up, walk-in и срочность; часть требуемых тем распределена иначе и должна уточняться без жесткого списка пациентов. |
| Дни 8-30 | partially implemented | `progressionRule()` задает безопасные диапазоны нагрузки и главу, но не является медицинским наполнением и не заменяет этот контракт. |
| 30 одиночных карточек | already implemented, pending review | Карточки редакционно завершены и валидируются, но имеют статус `pending_medical_review`. |
| Исследования и решения владельца | already implemented | Есть классификация, предложение, согласие, частичное согласие, отказ и отсутствие результата/оплаты при отказе. |
| Общение и назначения | partially implemented | Стратегии общения работают; старые планы гидратируются как единый утвержденный bundle. Полные составные компоненты требуют авторского заполнения. |
| Оборудование и направления | partially implemented | Capability registry и безопасная маршрутизация готовы; утвержденный активный контент есть только для микроскопа. |
| Повторные визиты | already implemented | Создаются только из прошедших случаев, сохраняют идентичность и не появляются из непроведенного приема. |
| Сочетанные случаи | pending_content | Движок оценки готов, 10 технических shell-bundle заблокированы и не участвуют в генерации. |
| Экономика и исход кампании | already implemented | Есть дневной ledger, кредит, недельная проверка и итог дня 30. |

## Фазы прогрессии

| Дни | Основные механики | Сложность и обучение | Контентные ограничения |
|---|---|---|---|
| 1-3 | Базовый прием, сбор анамнеза, осмотр, простые исследования, предварительная оценка, план и выписка | Ясные одиночные случаи, малая нагрузка, полные и контекстные подсказки | Только проверенные одиночные карточки с подходящими `unlockDay`, видом, оснащением и безопасным маршрутом |
| 4-7 | Диагностическая неопределенность, отказ или частичное согласие, малоценное исследование, последствия первых решений | Подсказки только о процессе и риске | Первый сочетанный случай допускается лишь после перевода конкретного bundle из `pending_content` в утвержденный статус; до этого используются одиночные случаи |
| 8-14 | Доверие, рост спроса, ограниченный бюджет, первые решения о развитии | Самостоятельный прием; сложность владельца и потока растет отдельно от медицинской тяжести | Разрешены только прошедшие валидацию карточки; развитие влияет на будущие, еще не созданные дни |
| 15-21 | Оборудование, входящие и исходящие направления, специализация, персонал, увеличение нагрузки | Требуется учитывать capacity, fatigue и безопасный маршрут | Рентген и УЗИ не привлекают клинический контент до появления утвержденных equipment-полей, результатов и направлений |
| 22-30 | Последствия прошлых решений, сложные владельцы, экономическое давление, итог кампании | Максимальная системная сложность без скрытого ухудшения клинической логики | Сочетанные состояния только из утвержденных bundle; день 30 использует сохраненные метрики и outcomes, а не заранее заданного пациента |

Для каждой фазы `allowedFamilies` является фильтром по проверенному manifest, `unlockDay`, видам, оснащению и механикам. Пустой результат фильтра не разрешает генератору создавать новый диагноз или текст: применяется безопасный одиночный fallback, перенос спроса или направление.

## Campaign Day Rule

Каждое правило дня должно иметь устойчивый `id` и версию и описывать ограничения, а не пациентов:

```text
CampaignDayRule
  id, schemaVersion, day, chapter
  start, end
  visitsTotal, followUps, unplannedNew, urgentSubset
  minimumFamilies, allowedFamilies, allowedCaseTags
  unlockedMechanicIds, tutorialMode, requiredEventIds
  ownerComplexityRange, clinicalComplexityRange
  capacityPolicyId, fallbackRuleIds
  combinedCasePolicy: disabled | approved_only
```

`requiredEventIds` могут требовать учебный или сюжетный тип визита, но не `caseId`, если конкретная карточка не была отдельно утверждена как обязательная. Уже созданный `GeneratedDay` после изменения правила не пересчитывается.

## Окончательная схема клинической карточки

### Идентичность и статус

```text
ClinicalCase
  schemaVersion, id, family, tier, unlockDay
  reviewStatus, editorialStatus
  titleForDeveloper, preliminaryDiagnosisLabel
  severity, workload
  species[], allowedSex[]
  compatibleOwnerProfiles[], compatibleOwnerModifiers[]
  forbiddenCombinations[]
  tutorialEligible, tutorialSequence[]
```

Обязательные статусы: `pending_content`, `pending_medical_review`, `approved`. Только `approved` может считаться медицински готовым; текущий тестовый opt-in режим вправе отдельно использовать редакционно завершенные карточки, но не меняет их review status.

### Жалоба и варианты анамнеза

```text
ComplaintVariant
  id, source=initial_complaint, text
  species?[], sex?[], ownerProfileIds?[], conditionIds?[]

HistoryQuestion
  id, buttonText, category, required, condition
  source=owner_history, revealsFactIds[]
  answers[]

HistoryAnswer
  id, ownerTags[], source=owner_history, text
  revealsFactIds[], conditionIds?[]
```

Варианты выбираются только как цельная совместимая ветка. Текст владельца не становится объективной находкой. Каждый раскрываемый факт имеет устойчивый ID; если его пока нет, выбранный текст можно временно сохранить целиком, но такой пробел заносится в отчет готовности.

### Диагностические доказательства

```text
ClinicalFact
  id, source
  statement
  discoveryPathIds[]
  supportsDiagnosisIds[]
  arguesAgainstDiagnosisIds[]
  redFlagId?

EvidenceRequirement
  id, diagnosisOptionId
  requiredFactIds[], supportiveFactIds[], exclusionFactIds[]
  minimumCoverage, missingEvidenceFeedbackId
```

Допустимые источники разделены: `initial_complaint`, `owner_history`, `physical_exam`, `diagnostic_test`, `doctor_interpretation`, `follow_up`. Предварительный диагноз является выводом врача, а не результатом исследования.

Текущие `revealsFactIds`, `criticalFacts`, `requires` и `discoveryPaths` являются совместимой основой. Полные связи `supports/arguesAgainst` требуют ветеринарного заполнения и не должны вычисляться из текста.

### Осмотр, материал и исследования

```text
ExamBlock
  id, label, actionId, source=physical_exam
  requires[], findings[]

Finding
  id, source=physical_exam, text
  revealsFactIds[], urgencyEffect?

SampleAction
  id, label, source=doctor_interpretation
  requires[], resultId, resultText, collectedMaterialTypeId

DiagnosticTest
  id, label, type, source=diagnostic_test
  classification
  requires[], requiredCapabilityIds[]
  costVetcoins, durationMinutes
  resultId, resultText, revealsFactIds[]
  unavailableReasonId?, safeAlternativeActionIds[]
```

`classification` принимает `required`, `recommended`, `optional`, `low_value`, `contraindicated` или `unavailable`. В финальном контенте классификация и медицинский результат задаются карточкой. Движок может обеспечить технический fallback, но не создает находки.

### Предварительная оценка

```text
DiagnosisOption
  id, label, source=doctor_interpretation
  requires[], evidenceRequirementId?
  isCorrectForTemplate, isUnsafeChoice
  feedbackId, feedbackText
  compatiblePlanIds[]
```

Список содержит только клинические оценки. Действия, отказы и варианты ведения в него не входят. Для допустимой, но не доказанной гипотезы нужен отдельный outcome оценки, а не автоматический штраф как за грубую ошибку.

### Составные назначения

```text
PlanOption
  id, label, source=doctor_interpretation
  requires[], compatibleDiagnosisIds[]
  components[]
  followUpRuleId, worseningSignIds[]

PrescriptionComponent
  id, title, type
  approvedTextId, approvedSteps[]
  coversDiagnosisIds[]
  requiredForSafety, optional, lowValue
  ownerMayDecline
  costVetcoins, timeCostMinutes
  omissionOutcomeId, contraindicationIds[]
```

Компоненты выбираются и оцениваются отдельно. Отказ от одного компонента не равен отказу от всего плана. До авторского заполнения `components[]` старый утвержденный план может работать только как единый bundle со статусом `pending_component_authoring`.

### Общение и решение владельца

```text
CommunicationOption
  id, label, goalId
  recommendedOwnerTraitIds[], riskyOwnerTraitIds[]
  timeCostMinutes
  comprehensionEffect, trustEffect, anxietyEffect
  irritationEffect, adherenceEffect, riskId

OwnerDecisionRule
  id, subjectType, subjectId
  allowedDecisions[]
  conditions[]
  reactionTextIds[]
  acceptedItemIds[], declinedItemIds[]
  minimumSafeAlternativeId?
```

Допустимые решения исследования: `accepted`, `asks_cost`, `requests_cheaper_option`, `refused`, `partially_accepted`, `delayed`. Для плана дополнительно допускаются `requests_repeat_explanation` и `accepted_partial_understanding`. Решение, согласие, стоимость, реакция и остаточная неопределенность сохраняются отдельно.

### Оборудование и направление

```text
EquipmentRequirement
  capabilityId
  purpose: definitive_diagnosis | treatment | preferred
  requiredForActionIds[]
  safeWithoutEquipmentActionIds[]
  arrivalAllowedWithoutEquipment
  attractionTags[], specialistReferralTags[]

ReferralPath
  id, direction: incoming | outgoing
  destinationId, reasonId
  triggerFactIds[], requiredCapabilityIds[]
  stabilizationActionIds[], ownerExplanationId
  followUpOwnership: local | receiving_clinic | shared
  safeOutcomeId
```

Нельзя создать входящий случай, если клиника не может выполнить безопасный осмотр, стабилизацию или направление. Наличие оборудования влияет только на будущие дни и не меняет уже сохраненный визит.

### Повторный визит и исход

```text
FollowUpRule
  id, triggerIds[]
  earliestDayOffset, latestDayOffset
  reasonId, complaintVariantIds[]
  preserveIdentity=true
  outcomeRequirementIds[]
  referralOwnership

OutcomeRule
  id, triggerIds[]
  clinicalOutcomeId, trustEffect, reliabilityEffect
  refundPolicyId?, freeRecheckPolicyId?
  followUpRuleIds[]
```

Follow-up создается только из реально прошедшего визита и выбранного плана или фактического ухудшения. Он сохраняет пациента, владельца, исходный `visitId`, причины возврата и уже известные факты.

### Сочетанный случай

```text
CombinedCaseBundle
  schemaVersion, bundleId, status
  caseIds[2], primaryCaseId, secondaryCaseId
  ownComplaintVariantIds[]
  ownHistoryQuestionIds[]
  ownExamBlockIds[]
  ownDiagnosticTestIds[]
  ownDiagnosisOptionIds[]
  ownPlanOptionIds[]
  ownCommunicationRuleIds[]
  diagnosticCoverageRules[]
  treatmentCoverageRules[]
  unsafeOmissionRules[]
  unnecessaryTreatmentRules[]
  ownFollowUpRuleIds[], ownOutcomeRuleIds[]
```

Автоматическое склеивание двух одиночных карточек запрещено. Bundle остается `pending_content`, пока все перечисленные собственные элементы не заполнены и не прошли медицинскую проверку.

## Контент, требующий ветеринарного заполнения

1. Медицинская проверка и явный review status всех 30 одиночных карточек.
2. Полные диагностические связи между фактами, гипотезами, исключающими признаками и красными флагами.
3. Явная классификация каждого исследования и условия, когда оно необходимо, малоценно, противопоказано или недоступно.
4. Компоненты назначений: обязательность, совместимость, риск пропуска, противопоказания и допустимый минимальный план.
5. Результаты частичного отказа владельца и безопасные альтернативы без автоматического наказания за сам факт ограниченного бюджета.
6. Медицинские требования и безопасные маршруты для рентгена и УЗИ, включая стабилизацию и направление.
7. Интервалы, причины и медицинские исходы повторных визитов, ухудшений и бесплатных исправлений.
8. Собственные жалобы, анамнез, осмотры, исследования, диагнозы, планы и outcomes для каждого из 10 сочетанных bundle.
9. Проверка совместимости вида, пола, возраста, местоимений, владельца, домашнего действия и доступного оборудования.
10. Ветеринарное подтверждение допустимых семейств, тегов сложности и обязательных событий каждой кампанийной фазы.

До закрытия этих пунктов структура может разрабатываться и тестироваться, но генератор не получает права дописывать отсутствующие медицинские факты.

## Критерии готовности контент-пака

- оба валидатора проходят без ошибок;
- все используемые сущности и выбранные варианты имеют устойчивые ID;
- `contentPackHash` меняется только вместе с версией и миграционным решением;
- нет UI-текста, который является единственным источником медицинской истины;
- для недоступного оборудования есть утвержденный безопасный путь;
- сочетанные bundle со статусом `pending_content` не выбираются;
- один seed и одинаковое состояние кампании воспроизводят тот же еще не созданный день;
- созданный день после reload гидратируется из ID и не перегенерируется;
- ветеринарная проверка отделена от редакционной и технической готовности.
