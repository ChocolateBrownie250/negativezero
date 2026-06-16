from fastapi import APIRouter, Depends, HTTPException

from .. import prompts as prompt_store
from ..auth import verify_auth
from ..models import PromptItem, PromptList, PromptUpdate

router = APIRouter(dependencies=[Depends(verify_auth)])


async def _list() -> PromptList:
    items = await prompt_store.get_overrides()
    return PromptList(items=[PromptItem(**it) for it in items])


@router.get("/prompts", response_model=PromptList)
async def list_prompts() -> PromptList:
    return await _list()


@router.put("/prompts/{stage}/{mode}", response_model=PromptList)
async def update_prompt(stage: str, mode: str, payload: PromptUpdate) -> PromptList:
    if not prompt_store.is_valid(stage, mode):
        raise HTTPException(status_code=404, detail="Unknown stage/mode")
    await prompt_store.set_override(stage, mode, base=payload.base, extra=payload.extra)
    return await _list()


@router.post("/prompts/{stage}/{mode}/reset", response_model=PromptList)
async def reset_prompt(stage: str, mode: str) -> PromptList:
    if not prompt_store.is_valid(stage, mode):
        raise HTTPException(status_code=404, detail="Unknown stage/mode")
    await prompt_store.reset(stage, mode)
    return await _list()
