"""Shared test fixtures: an in-memory SQLite DB and an API client with overrides."""

import re
import uuid
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401  ensure all models register on Base.metadata
from app.db import Base
from app.dependencies import get_db
from app.main import create_app
from app.models.document import Category, Document
from app.models.obra import Obra
from app.models.user import Role, User
from app.security import hash_password
from app.services.email import InMemoryEmailSender, get_email_sender
from app.storage import InMemoryStorage, get_storage


@pytest.fixture
def db_session() -> Iterator[Session]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    Base.metadata.create_all(engine)
    testing_session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    session = testing_session()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture
def storage() -> InMemoryStorage:
    return InMemoryStorage()


@pytest.fixture
def email_sender() -> InMemoryEmailSender:
    return InMemoryEmailSender()


@pytest.fixture
def client(
    db_session: Session, storage: InMemoryStorage, email_sender: InMemoryEmailSender
) -> Iterator[TestClient]:
    app = create_app()
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_storage] = lambda: storage
    app.dependency_overrides[get_email_sender] = lambda: email_sender
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _username_of(identifier: str) -> str:
    """Login name for an address: everything before the @, cleaned of separators."""
    local = identifier.split("@", 1)[0]
    return re.sub(r"[^a-z0-9._-]", "", local.strip().lower())


@pytest.fixture
def auth_headers(client, make_user):
    """Create a user with the given role and return Bearer auth headers for it."""

    def _headers(
        role: Role = Role.ADMINISTRADOR,
        email: str | None = None,
        password: str = "s3cret-pass",
    ) -> dict[str, str]:
        email = email or f"{role.value}@example.com"
        make_user(email=email, password=password, role=role)
        return _bearer(client, _username_of(email), password)

    return _headers


@pytest.fixture
def headers_for(client):
    """Bearer headers for an existing user, addressed by username or by e-mail."""

    def _headers(identifier: str, password: str = "s3cret-pass") -> dict[str, str]:
        return _bearer(client, _username_of(identifier), password)

    return _headers


def _bearer(client, username: str, password: str) -> dict[str, str]:
    token = client.post("/auth/login", json={"username": username, "password": password}).json()[
        "access_token"
    ]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def make_user(db_session: Session):
    def _make(
        email: str = "user@example.com",
        password: str = "s3cret-pass",
        role: Role = Role.ENGENHEIRO,
        is_active: bool = True,
        username: str | None = None,
    ) -> User:
        user = User(
            id=uuid.uuid4(),
            # Mirrors what the migration does to existing rows: the e-mail's local part.
            username=username or _username_of(email),
            email=email,
            hashed_password=hash_password(password),
            role=role,
            is_active=is_active,
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
        return user

    return _make


@pytest.fixture
def make_obra(db_session: Session):
    def _make(nome: str = "Obra A", users: list[User] | None = None) -> Obra:
        obra = Obra(nome=nome)
        if users:
            obra.users.extend(users)
        db_session.add(obra)
        db_session.commit()
        db_session.refresh(obra)
        return obra

    return _make


@pytest.fixture
def make_document(db_session: Session):
    def _make(
        obra: Obra,
        creator: User,
        nome: str = "doc.pdf",
        categoria: Category = Category.CONTRATO,
    ) -> Document:
        document = Document(nome=nome, obra_id=obra.id, categoria=categoria, criado_por=creator.id)
        db_session.add(document)
        db_session.commit()
        db_session.refresh(document)
        return document

    return _make


def make_pdf(paginas: int = 1, texto: str = "documento", tamanhos=None) -> bytes:
    """Um PDF real, porque pypdf precisa conseguir abrir o arquivo.

    `tamanhos` recebe uma lista de (largura, altura) em pontos para produzir um
    arquivo que mistura tamanhos de página — o caso que a conversão de coordenadas
    precisa tratar.
    """
    import io

    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas as rl_canvas

    tamanhos = tamanhos or [A4] * paginas
    buffer = io.BytesIO()
    c = rl_canvas.Canvas(buffer, pagesize=tamanhos[0])
    for indice, tamanho in enumerate(tamanhos, start=1):
        c.setPageSize(tamanho)
        c.drawString(72, tamanho[1] - 72, f"{texto} - pagina {indice}")
        c.showPage()
    c.save()
    return buffer.getvalue()


@pytest.fixture
def pdf_factory():
    return make_pdf
