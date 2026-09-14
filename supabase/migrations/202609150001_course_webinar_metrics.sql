BEGIN;
CREATE TABLE public.course_webinar_metrics (
  course_id uuid PRIMARY KEY REFERENCES public.courses(id) ON DELETE CASCADE,
  group_chat_count bigint CHECK (group_chat_count BETWEEN 0 AND 1000000000),
  communication_count bigint CHECK (communication_count BETWEEN 0 AND 1000000000),
  live_start_count bigint CHECK (live_start_count BETWEEN 0 AND 1000000000),
  live_peak_count bigint CHECK (live_peak_count BETWEEN 0 AND 1000000000),
  hours_to_peak numeric CHECK (hours_to_peak BETWEEN 0 AND 1000 AND hours_to_peak=round(hours_to_peak,2)),
  live_end_count bigint CHECK (live_end_count BETWEEN 0 AND 1000000000),
  ad_spend bigint CHECK (ad_spend BETWEEN 0 AND 1000000000000),
  payment_count bigint CHECK (payment_count BETWEEN 0 AND 1000000000),
  revenue bigint CHECK (revenue BETWEEN 0 AND 1000000000000),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (live_peak_count >= live_start_count),
  CHECK (live_peak_count >= live_end_count)
);
ALTER TABLE public.course_webinar_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read course webinar metrics" ON public.course_webinar_metrics
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.courses c WHERE c.id=course_id AND public.is_workspace_member(c.workspace_id)
  ));
REVOKE ALL ON public.course_webinar_metrics FROM anon,authenticated;
GRANT SELECT ON public.course_webinar_metrics TO authenticated;

CREATE FUNCTION public.save_course_webinar_metrics(p_course_id uuid,p_metrics jsonb,p_expected_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE entry record; amount numeric; result public.course_webinar_metrics;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT401',MESSAGE='로그인이 필요합니다.'; END IF;
  PERFORM 1 FROM public.courses WHERE id=p_course_id AND public.is_workspace_member(workspace_id) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='강의를 찾을 수 없거나 접근 권한이 없습니다.'; END IF;
  IF p_expected_version IS NULL OR p_expected_version<0 OR p_metrics IS NULL OR jsonb_typeof(p_metrics)<>'object' THEN
    RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='웨비나 입력 형식이 올바르지 않습니다.';
  END IF;
  FOR entry IN SELECT * FROM jsonb_each(p_metrics) LOOP
    IF entry.key NOT IN ('group_chat_count','communication_count','live_start_count','live_peak_count','hours_to_peak','live_end_count','ad_spend','payment_count','revenue') THEN
      RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='알 수 없는 웨비나 항목입니다.';
    END IF;
    IF entry.value='null'::jsonb THEN CONTINUE; END IF;
    IF jsonb_typeof(entry.value)<>'number' THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='숫자를 입력해 주세요.'; END IF;
    amount:=(entry.value#>>'{}')::numeric;
    IF amount<0 OR amount>(CASE WHEN entry.key='hours_to_peak' THEN 1000 WHEN entry.key IN ('ad_spend','revenue') THEN 1000000000000 ELSE 1000000000 END)
      OR (entry.key<>'hours_to_peak' AND amount<>trunc(amount)) OR (entry.key='hours_to_peak' AND amount<>round(amount,2)) THEN
      RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='인원·결제 건수·금액은 0 이상의 정수, 시간은 소수 둘째 자리까지 입력해 주세요.';
    END IF;
  END LOOP;
  IF p_expected_version>0 AND NOT EXISTS(SELECT 1 FROM public.course_webinar_metrics WHERE course_id=p_course_id) THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='저장 정보가 변경되었습니다. 새로 불러온 뒤 저장해 주세요.';
  END IF;
  INSERT INTO public.course_webinar_metrics(course_id,group_chat_count,communication_count,live_start_count,live_peak_count,hours_to_peak,live_end_count,ad_spend,payment_count,revenue)
  VALUES(p_course_id,(p_metrics->>'group_chat_count')::numeric::bigint,(p_metrics->>'communication_count')::numeric::bigint,
    (p_metrics->>'live_start_count')::numeric::bigint,(p_metrics->>'live_peak_count')::numeric::bigint,(p_metrics->>'hours_to_peak')::numeric,
    (p_metrics->>'live_end_count')::numeric::bigint,(p_metrics->>'ad_spend')::numeric::bigint,(p_metrics->>'payment_count')::numeric::bigint,(p_metrics->>'revenue')::numeric::bigint)
  ON CONFLICT(course_id) DO UPDATE SET
    group_chat_count=excluded.group_chat_count,communication_count=excluded.communication_count,
    live_start_count=excluded.live_start_count,live_peak_count=excluded.live_peak_count,hours_to_peak=excluded.hours_to_peak,
    live_end_count=excluded.live_end_count,ad_spend=excluded.ad_spend,payment_count=excluded.payment_count,revenue=excluded.revenue,
    version=course_webinar_metrics.version+1,updated_at=clock_timestamp()
  WHERE course_webinar_metrics.version=p_expected_version
  RETURNING * INTO result;
  IF result.course_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='다른 사용자가 수정했습니다. 새로 불러온 뒤 다시 저장해 주세요.'; END IF;
  RETURN to_jsonb(result);
EXCEPTION WHEN check_violation THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='최대 인원과 입력 값의 범위를 확인해 주세요.';
END $$;
REVOKE ALL ON FUNCTION public.save_course_webinar_metrics(uuid,jsonb,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_course_webinar_metrics(uuid,jsonb,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
