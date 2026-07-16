# Source review — `renal_ckd`

Дата проверки: 15 июля 2026 года.

Авторский статус: `author_complete`.

Source status: `source_checked`.

Внешний ветеринарный статус: `external_veterinary_review_pending`.

## Проверенные решения

- CKD сначала диагностируется и только затем стадируется;
- IRIS stage применяется только к стабильному адекватно гидратированному
  пациенту с подтверждённой хронической почечной патологией;
- преренальная, постренальная, AKI и acute-on-chronic составляющие не
  смешиваются со стабильной CKD;
- одно повышение creatinine/SDMA у обезвоженного пациента не создаёт CKD или
  стадию;
- ранняя CKD возможна при reference creatinine, если есть стойкая renal
  concentrating defect, renal proteinuria, SDMA/trend or interpreted structural
  evidence;
- один разбавленный образец, один SDMA, одна dipstick protein или случайная
  киста не являются достаточным основанием;
- creatinine интерпретируется с muscle mass, fasted state, breed и методом;
- SDMA и creatinine не усредняются математически; при расхождении выполняется
  стабильный same-method repeat, сохраняется uncertainty, а стойкий конфликт
  получает осторожную reviewed-интерпретацию;
- stage, renal proteinuria substage и systemic BP/target-organ substage
  хранятся отдельно;
- renal proteinuria требует повторных UPC и исключения pre-renal/post-renal
  источников, active sediment, blood и infection;
- величина proteinuria может направить к glomerular pattern, но не определяет
  этиологию автоматически;
- hypoalbuminemia требует проверки liver, GI, inflammation и иных причин;
- edema/effusion/thrombotic signs активируют urgent specialist route, но код не
  генерирует antithrombotic protocol;
- trigger workup зависит от региона и authored-гипотезы; универсальная панель
  не назначается;
- renal biopsy обсуждается только если результат изменит решение и риск
  приемлем; отказ не обнуляет safe monitoring;
- давление измеряется стандартизованной серией с low-stress protocol;
- одно стрессовое BP без target-organ damage не создаёт persistent
  hypertension;
- retinal/neurologic target-organ damage не ждёт недель подтверждения;
- retinal finding является authored exam result и не выводится renderer из
  цифры давления;
- current treated substage помечается treatment-state, а исходная untreated
  серия сохраняется;
- dehydration peak не переписывает baseline; новый stable baseline создаётся
  после стабилизации;
- shock, oliguria/anuria, obstruction, severe electrolyte/acid-base disorder,
  repeated vomiting или altered mentation запускают hospital route до
  стадирования;
- advanced CKD quality of life включает боль, тошноту, intake, hydration,
  mobility, interaction и good/bad days, а не только лабораторные числа;
- referral и safe supportive/palliative route представлены без скрытого
  морального или экономического наказания;
- external SDMA, UPC и imaging имеют turnaround и возвращаются в тот же episode
  snapshot;
- собственный анализатор, тонометр или УЗИ не открывают capability без навыка и
  зависимостей.

## Актуализация IRIS

Production-файл ссылается на текущую online IRIS Staging System, а не зашивает
пороговые числа в UI. Это важно, потому что IRIS прямо называет систему
`work in progress` и уже изменила canine Stage 2 range.

Из текущей версии перенесены только устойчивые правила:

- CKD must be stable before staging;
- stable creatinine и/или SDMA используются вместе с клиническим контекстом;
- discordant markers требуют repeat/context и могут потребовать более
  осторожной стадии;
- proteinuria и pressure являются независимыми substages;
- target-organ damage позволяет не ждать подтверждения persistence;
- treated substage должен отражать текущий результат с отдельной отметкой
  treatment-state.

Числовые cutoffs и treatment thresholds оставлены для отдельного
versioned-veterinary protocol.

## Намеренно не утверждено автором

- числовые stage/UPC/BP/phosphorus/HCT targets;
- препарат, доза, интервал и treatment change;
- конкретный состав renal diet;
- infusion, electrolyte correction, feeding tube или dialysis technique;
- biopsy technique, indication threshold и anesthesia plan;
- конкретная antiproteinuric, antihypertensive или antithrombotic схема;
- окончательный статус `approved`.

До независимого ветеринарного review family, 6 variants и 18 presentations
остаются `generatorEligible: false`.

Полные URL и область применения пяти источников находятся в `sourceCatalog`
production-файла.
