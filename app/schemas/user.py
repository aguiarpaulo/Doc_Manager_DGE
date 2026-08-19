"""User request/response schemas."""

import uuid

from pydantic import BaseModel, ConfigDict, EmailStr

from app.models.user import Role
from app.usernames import Username


class UserCreate(BaseModel):
    username: Username
    email: EmailStr
    password: str
    role: Role


class UserUpdate(BaseModel):
    role: Role | None = None
    is_active: bool | None = None


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str
    email: EmailStr
    role: Role
    is_active: bool
    # Whether a rubric is registered — not the rubric itself. The SPA needs this to
    # decide whether to demand registration on first access, and it must not cost an
    # extra request on every mount.
    has_signature: bool = False
