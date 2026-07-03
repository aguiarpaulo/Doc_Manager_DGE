"""Shared test fixtures: an in-memory SQLite DB and an API client with overrides."""

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
        token = client.post("/auth/login", json={"email": email, "password": password}).json()[
            "access_token"
        ]
        return {"Authorization": f"Bearer {token}"}

    return _headers


@pytest.fixture
def headers_for(client):
    """Return Bearer auth headers for an existing user, by email."""

    def _headers(email: str, password: str = "s3cret-pass") -> dict[str, str]:
        token = client.post("/auth/login", json={"email": email, "password": password}).json()[
            "access_token"
        ]
        return {"Authorization": f"Bearer {token}"}

    return _headers


@pytest.fixture
def make_user(db_session: Session):
    def _make(
        email: str = "user@example.com",
        password: str = "s3cret-pass",
        role: Role = Role.ENGENHEIRO,
        is_active: bool = True,
    ) -> User:
        user = User(
            id=uuid.uuid4(),
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
        document = Document(
            nome=nome, obra_id=obra.id, categoria=categoria, criado_por=creator.id
        )
        db_session.add(document)
        db_session.commit()
        db_session.refresh(document)
        return document

    return _make
