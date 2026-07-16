# Задание программисту — P8 review gate

## Цель

Импортировать P8 как fail-closed слой проверки и будущих reviewer decisions.
Не включать 39 семейств в production generator и не показывать исходные
player-facing тексты, пока correction gate и veterinary gate закрыты.

## Обязательное поведение

1. Сверить `MANIFEST.json`, версии и SHA-256 файлов.
2. Хранить P8 отдельно от текущих 30 работающих case ID.
3. Показать в служебном отчёте фактический статус source audit и число P0/P1.
4. Отклонять reviewer decision, если не совпадает package digest, ID или version.
5. Не позволять одному family-решению молча одобрить дочерние variant и
   presentation.
6. Не выводить игроку текст, помеченный открытым P0/P1.
7. Поддержать точные решения `approved`, `changes_required`, `rejected`,
   `not_reviewed`; только первое может участвовать в будущем activation manifest.
8. Разговорную библиотеку подключать как слой формы речи: она не меняет
   medical truth, результаты исследований, согласие или последствия.
9. В emergency отключать редкие абсурдные события и лёгкий юмор.
10. Сохранить текущую save schema; P8 не даёт разрешения на миграцию.

## Запрещено

- автоматически переводить или «улучшать» медицинские тексты в runtime;
- заменять `authored`/`fixed` случайным результатом;
- считать старый `author_complete` медицинским approval;
- активировать семейство из-за отсутствия P0 при наличии P1 или незакрытого
  внешнего review;
- заставлять характер владельца раскрывать диагноз;
- делать смешную реплику единственным способом узнать критический факт.

## Проверки

```sh
node p8-medical-review-authoring/scripts/audit-p8-source.mjs
node p8-medical-review-authoring/scripts/validate-human-dialogues.mjs --require-clean
node p8-medical-review-authoring/scripts/build-p8-package.mjs
git diff --check
```

Ожидаемый исходный статус: source audit `blocked`, dialogue library `pass`,
activation `false`. Это корректный результат P8 до авторского исправления всех
645 представлений и внешнего ветеринарного решения.
