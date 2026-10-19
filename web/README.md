# Threshold web (Next.js static export)

A pure client app: there are no API routes, no SSR, no server actions and no middleware. All data comes from the FastAPI backend at `NEXT_PUBLIC_API_BASE`, which defaults to `/api`.

Run it from the repo root with `python scripts/tasks.py local`, which sets `NEXT_PUBLIC_API_BASE=http://localhost:8000/api`.

When you add a page, add its route to `ROUTES` in the CloudFront Function in `../template.yaml`. `backend/tests/test_infra.py` fails if the two drift apart.
