from fastapi import APIRouter, Depends

from ..auth import verify_auth
from ..glossary import load_glossary, update_anti_correct, update_personal
from ..models import GlossaryUpdate, GlossaryView

router = APIRouter(dependencies=[Depends(verify_auth)])


@router.get("/glossary", response_model=GlossaryView)
async def get_glossary() -> GlossaryView:
    g = await load_glossary()
    return GlossaryView(
        core=g.core,
        extended=g.extended,
        personal=g.personal,
        anti_correct=g.anti_correct,
    )


@router.patch("/glossary", response_model=GlossaryView)
async def patch_glossary(payload: GlossaryUpdate) -> GlossaryView:
    if payload.personal is not None:
        await update_personal(payload.personal)
    if payload.anti_correct is not None:
        await update_anti_correct(payload.anti_correct)
    g = await load_glossary()
    return GlossaryView(
        core=g.core,
        extended=g.extended,
        personal=g.personal,
        anti_correct=g.anti_correct,
    )
