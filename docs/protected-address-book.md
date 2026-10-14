# 전체 명단 고정

기존 `비즈업-전체-1013` 주소록을 `전체 명단`으로 변경하고 주소록 매니저의 최상단에 고정합니다. 기존 ID와 연락처, 가져오기 이력, 발송 이력, 강의 연결은 유지합니다.

- 관리자에게도 삭제·이름 수정 버튼을 제공하지 않으며 API와 DB 트리거에서 차단합니다.
- 연락처 추가, 다운로드, 병합 원본 선택은 계속 사용할 수 있습니다.
- 일반 주소록 생성·병합·이름 변경에는 `전체 명단` 이름을 사용할 수 없습니다. 워크스페이스마다 해당 이름은 하나만 존재할 수 있습니다.
- 다른 주소록의 연락처를 자동으로 합치는 기능은 아닙니다.

검증: 정렬·DB 보호 테스트, 실제 API와 브라우저 통합 검증(`scripts/verify-protected-address-book.cjs`), ESLint, 프로덕션 빌드 통과. 운영 마이그레이션 `20261014090248` 적용 후 연락처 27,444명, 가져오기 이력 1건, 발송 작업 1건 보존 및 트랜잭션 내 삭제·이름 변경 차단을 확인했습니다.

보안 진단에서 이번 변경에 관한 새 경고는 없습니다. 적용 전후 기존 진단은 동일합니다. 범위 밖의 설정은 변경하지 않았습니다.

| 기존 진단 | 건수 | 참고 |
| --- | ---: | --- |
| RLS 정책 없음 (INFO) | 26 | [정책 진단](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) |
| 함수 search_path 미지정 | 32 | [검색 경로 진단](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable) |
| 익명 역할의 SECURITY DEFINER 실행 권한 | 7 | [익명 실행 권한 진단](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) |
| 로그인 역할의 SECURITY DEFINER 실행 권한 | 13 | [로그인 실행 권한 진단](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) |
| 유출 비밀번호 보호 비활성화 | 1 | [비밀번호 보호 설정](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) |
