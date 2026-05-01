# Anamnesis

[English](README.md) | Русский

`Anamnesis` — доказательно-ориентированный clinician-in-the-loop контур для структурированного приёма кейсов, ограниченного импорта документов и FHIR-ресурсов, подготовки physician packet, явного разбора врачом и финализации с append-only аудитом.

Репозиторий сознательно не позиционируется как «AI doctor», клинический decision engine или универсальный FHIR-сервер. Его публичная область применения уже и строже: поддержка врачебного workflow с границами, которые уже подтверждены кодом, тестами и документированной evidence base.

## Зачем существует этот проект

`Anamnesis` задуман как узкий самостоятельный слой для медико-смежного workflow software. Проект делает ставку не на громкие AI-обещания, а на проверяемый scope, явные interoperability boundaries и аудируемые переходы состояния.

На практике это означает:

- помощь врачу в сборке и проверке материалов по кейсу;
- ограниченный и контролируемый импорт документов;
- строгую отделённость от диагностики, назначения лечения и клинического триажа;
- честную связь между публичными утверждениями и реальной реализацией.

## Что уже реализовано

- структурированный intake и lifecycle API для кейсов;
- создание кейсов для общего intake, MRI second opinion и mRNA board-review семейств;
- owner-scoped visibility для JWT-created кейсов и административный путь через API key;
- выдача и отзыв access grants для кейса;
- регистрация и удаление source artifacts с отслеживанием устаревания physician packet;
- evidence-lineage graph route для производных артефактов;
- регистрация molecular sample и study-context/QC summary;
- bounded import для `text/plain`, `text/markdown`, `Binary`, `DocumentReference`, `Bundle.type=document` и `Bundle.type=collection` в поддерживаемом срезе;
- явная request-gated `attachment.url` dereference по `https` с SSRF-aware ограничениями;
- physician packet drafting, review ledger и finalization только для approved и non-stale draft;
- append-only audit trail, operations summary и observability для remote JWKS;
- durable SQLite persistence с AES-256-GCM шифрованием данных на диске.

## Что проект явно не заявляет

- медицинскую диагностику;
- оценку срочности;
- рекомендации по лечению или рецептам;
- general-purpose FHIR REST server;
- SMART on FHIR authorization flows;
- ingestion изображений, геномных файлов, wearables или OCR pipelines;
- замену EHR.

## Interoperability boundary

FHIR здесь существует как ограниченный импортный шов внутрь workflow artifacts. Репозиторий не обещает общий FHIR CRUD, search, transactions, history, subscriptions или `/metadata` capability discovery.

Поддерживаемый срез сейчас включает:

- inline `Binary` и `DocumentReference` для текстовых payload;
- `Bundle.type=document` и `Bundle.type=collection` внутри поддерживаемой области;
- удалённое чтение `attachment.url` только через явный opt-in путь с ограничениями.

## Безопасность

Текущий baseline намеренно сдержанный, но явный:

- bearer authentication на application routes;
- development-only override, запрещённый в production;
- per-IP rate limiting;
- Helmet header hardening;
- шифрованное durable storage при заданных `STORE_PATH` и `ENCRYPTION_KEY`;
- append-only audit history для write flows;
- специальные SSRF controls для самого рискованного interoperability path.

## Быстрый старт

Используйте `.env.example` как базовый runtime contract.

```bash
npm install
npm run validate:public-export
npm run dev
```

Перед запуском задайте один из параметров аутентификации: `API_KEY`, `JWT_SECRET`, `JWT_PUBLIC_KEY`, `JWT_JWKS` или `JWT_JWKS_URL`, если только вы явно не включаете `ALLOW_INSECURE_DEV_AUTH=true` для локальной разработки.

Порт по умолчанию: `4020`

## Проверка качества

Публикационный локальный baseline:

```bash
npm run validate:public-export
```

Это разворачивается в:

```bash
npm run lint
npm run test:coverage
npm run build
npm run audit:prod
```

Отдельный evaluation rail для sidecar-пути:

```bash
npm run test:llm-evaluation
```

## Основные доверенные поверхности репозитория

- [README.md](README.md)
- [openapi.yaml](openapi.yaml)
- [docs/claim-boundary.md](docs/claim-boundary.md)
- [docs/traceability-matrix.md](docs/traceability-matrix.md)
- [docs/security/posture-and-gaps.md](docs/security/posture-and-gaps.md)
- [CONTRIBUTING.md](CONTRIBUTING.md)
- [SECURITY.md](SECURITY.md)
- [SUPPORT.md](SUPPORT.md)
- [GOVERNANCE.md](GOVERNANCE.md)
- [CITATION.cff](CITATION.cff)
- [CHANGELOG.md](CHANGELOG.md)

## Governance и сопровождение

- [GOVERNANCE.md](GOVERNANCE.md) описывает правила сопровождения и change-control boundaries.
- [SUPPORT.md](SUPPORT.md) объясняет каналы поддержки и границы security reporting.
- [PUBLISHING.md](PUBLISHING.md) — публичный GitHub release checklist.
- [CONTRIBUTING.md](CONTRIBUTING.md) описывает вклад в репозиторий.
- [SECURITY.md](SECURITY.md) задаёт процесс ответственного раскрытия уязвимостей.

## Лицензия

MIT. См. [LICENSE](LICENSE).
