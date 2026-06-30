from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import QuestionVote, QuizSet, User
from app.routers.users import get_or_create_user
from app.schemas import QuestionVotes, VoteIn

router = APIRouter(prefix="/quiz-sets", tags=["votes"])

REACTIONS = {"skull", "heart"}


async def _counts(session: AsyncSession, quiz_set_id: int, index: int) -> tuple[int, int]:
    """(skull, heart) totals for one question."""
    rows = (
        await session.execute(
            select(QuestionVote.reaction, func.count())
            .where(QuestionVote.quiz_set_id == quiz_set_id, QuestionVote.question_index == index)
            .group_by(QuestionVote.reaction)
        )
    ).all()
    by_reaction = dict(rows)
    return by_reaction.get("skull", 0), by_reaction.get("heart", 0)


@router.get("/{quiz_set_id}/votes", response_model=list[QuestionVotes])
async def list_votes(
    quiz_set_id: int,
    user_name: str | None = None,
    session: AsyncSession = Depends(get_session),
):
    """Aggregate reactions per question for a set, with the caller's own choices.

    Only questions that have at least one vote appear; the client defaults the
    rest to zero.
    """
    agg = (
        await session.execute(
            select(QuestionVote.question_index, QuestionVote.reaction, func.count())
            .where(QuestionVote.quiz_set_id == quiz_set_id)
            .group_by(QuestionVote.question_index, QuestionVote.reaction)
        )
    ).all()

    tally: dict[int, dict[str, int]] = {}
    for index, reaction, count in agg:
        tally.setdefault(index, {})[reaction] = count

    mine: dict[int, str] = {}
    if user_name:
        user = (
            await session.execute(select(User).where(User.name == user_name.strip()))
        ).scalar_one_or_none()
        if user is not None:
            mine_rows = (
                await session.execute(
                    select(QuestionVote.question_index, QuestionVote.reaction).where(
                        QuestionVote.quiz_set_id == quiz_set_id,
                        QuestionVote.user_id == user.id,
                    )
                )
            ).all()
            mine = {index: reaction for index, reaction in mine_rows}

    indices = set(tally) | set(mine)
    return [
        QuestionVotes(
            question_index=index,
            skull=tally.get(index, {}).get("skull", 0),
            heart=tally.get(index, {}).get("heart", 0),
            mine=mine.get(index),
        )
        for index in sorted(indices)
    ]


@router.post("/{quiz_set_id}/questions/{question_index}/vote", response_model=QuestionVotes)
async def vote(
    quiz_set_id: int,
    question_index: int,
    payload: VoteIn,
    session: AsyncSession = Depends(get_session),
):
    """Cast, change, or clear (by re-clicking the same one) a reaction."""
    if payload.reaction not in REACTIONS:
        raise HTTPException(422, "reaction must be 'skull' or 'heart'")

    quiz_set = await session.get(QuizSet, quiz_set_id)
    if quiz_set is None:
        raise HTTPException(404, "quiz set not found")
    if not 0 <= question_index < len(quiz_set.questions_json):
        raise HTTPException(404, "question not found")

    user = await get_or_create_user(session, payload.user_name)

    existing = (
        await session.execute(
            select(QuestionVote).where(
                QuestionVote.quiz_set_id == quiz_set_id,
                QuestionVote.question_index == question_index,
                QuestionVote.user_id == user.id,
            )
        )
    ).scalar_one_or_none()

    mine: str | None
    if existing is None:
        session.add(
            QuestionVote(
                quiz_set_id=quiz_set_id,
                question_index=question_index,
                user_id=user.id,
                reaction=payload.reaction,
            )
        )
        mine = payload.reaction
    elif existing.reaction == payload.reaction:
        # Re-clicking the active reaction clears the vote.
        await session.execute(delete(QuestionVote).where(QuestionVote.id == existing.id))
        mine = None
    else:
        existing.reaction = payload.reaction
        mine = payload.reaction

    await session.commit()

    skull, heart = await _counts(session, quiz_set_id, question_index)
    return QuestionVotes(question_index=question_index, skull=skull, heart=heart, mine=mine)
