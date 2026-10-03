import asyncio
from dataclasses import replace

import pytest

from config import FRAME_BYTES, Settings
from streaming import DecodeJob, DecodeMailbox, Segmenter, StreamError


def settings(**kwargs):
    return replace(Settings(), min_partial_ms=200, partial_interval_ms=100,
                   end_silence_ms=100, pre_roll_ms=60, speech_start_ms=60,
                   max_segment_ms=2000, **kwargs)


def test_pcm_packet_boundaries_and_short_tail_preserve_samples():
    jobs = []
    segmenter = Segmenter(settings(), lambda frame: True, jobs.append)
    raw = b"\x21\x00" * (16_000 + 137)
    sizes = [1, 511, 71, 1333, 640, 239]
    pos = 0
    n = 0
    while pos < len(raw):
        size = sizes[n % len(sizes)]
        segmenter.feed(raw[pos:pos + size])
        pos += size
        n += 1
    segmenter.finish()
    final = jobs[-1]
    assert final.final
    assert final.pcm == raw
    assert final.start_sample == 0
    assert final.end_sample == len(raw) // 2
    assert any(not job.final for job in jobs)


def test_continuous_speech_is_bounded_without_lost_or_repeated_samples():
    jobs = []
    segmenter = Segmenter(settings(), lambda frame: True, jobs.append)
    raw = b"\x2b\x00" * 81_123
    for pos in range(0, len(raw), FRAME_BYTES):
        segmenter.feed(raw[pos:pos + FRAME_BYTES])
    segmenter.finish()
    finals = [job for job in jobs if job.final]
    assert b"".join(job.pcm for job in finals) == raw
    assert all(len(job.pcm) <= 64_000 for job in finals)
    assert [job.segment_id for job in finals] == [1, 2, 3]
    assert finals[0].reason == "max_duration"
    assert all(a.end_sample == b.start_sample for a, b in zip(finals, finals[1:]))


def test_silence_does_not_submit_model_jobs():
    jobs = []
    segmenter = Segmenter(settings(), lambda frame: False, jobs.append)
    segmenter.feed(b"\0" * 200_000)
    segmenter.finish()
    assert not jobs
    assert not segmenter.audio
    assert len(segmenter.pre_roll) == 0


def test_incomplete_pcm16_sample_is_reported():
    segmenter = Segmenter(settings(), lambda frame: True, lambda job: None)
    segmenter.feed(b"\0")
    with pytest.raises(StreamError, match="Niepełna próbka"):
        segmenter.finish()


def test_mailbox_coalesces_partials_and_preserves_finals():
    async def scenario():
        mailbox = DecodeMailbox(2)
        first = DecodeJob(1, 0, 320, b"a" * 640)
        newer = replace(first, end_sample=640, pcm=b"a" * 1280)
        final = replace(newer, final=True)
        mailbox.put(first)
        mailbox.put(newer)
        assert len(mailbox.jobs) == 1
        mailbox.put(final)
        second = replace(first, segment_id=2)
        mailbox.put(second)
        mailbox.put(replace(second, final=True))
        with pytest.raises(StreamError) as error:
            mailbox.put(replace(first, segment_id=3))
        assert error.value.code == 1013
        mailbox.close()
        assert await mailbox.get() == final
        assert (await mailbox.get()).segment_id == 2
        assert await mailbox.get() is None
    asyncio.run(scenario())
