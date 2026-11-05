# B.U.G 분실물 보관소

인터넷에 올려서, 노트북을 꺼도 누구나 휴대폰으로 접속하는 버전이에요.
구조는 간단해요. **Render**(서버)가 화면을 보여 주고, **Supabase**(데이터베이스)가 글과 사진을 저장해요. 둘 다 무료 플랜이 있어요.

> 무료 플랜의 조건은 자주 바뀌어요. 가입할 때 각 사이트의 안내를 한 번 더 확인해 주세요.

## 준비물
- GitHub 계정, Supabase 계정, Render 계정 (모두 무료 가입. GitHub 계정으로 로그인하면 편해요)
- 이 폴더의 파일 전부: `server.js`, `package.json`, `schema.sql`, `public/index.html`

## 1단계. Supabase에 저장소 만들기
1. supabase.com 에 가입하고 **New project** 를 만들어요. 이름은 `bug-lostfound`, 지역은 가까운 곳(Seoul)을 고르고 데이터베이스 비밀번호를 정해요.
2. 프로젝트가 준비되면 왼쪽 메뉴의 **SQL Editor** 를 열고, `schema.sql` 내용을 통째로 붙여 넣은 뒤 **Run** 을 눌러요.
3. 아래 두 가지를 메모장에 복사해 둬요. (메뉴 이름은 조금 다를 수 있어요)
   - **Project URL**: `https://xxxxxxxx.supabase.co` 모양의 주소. 화면 위쪽 **Connect** 버튼이나 Settings 의 API 쪽에 있어요.
   - **Secret key**: **Settings → API Keys** 에서 `sb_secret_…` 로 시작하는 키. 이 키는 서버만 알아야 해요. 사진을 찍어 올리거나 GitHub에 올리면 안 돼요.

## 2단계. GitHub에 코드 올리기
1. github.com 에서 새 저장소(repository)를 만들어요. 이름은 `bug-lostfound`, **Private** 로 두는 걸 추천해요.
2. **Add file → Upload files** 로 `server.js`, `package.json`, `public` 폴더(안의 `index.html`)를 올리고 **Commit** 해요. (`schema.sql`, `README.md` 는 올려도 되고 안 올려도 돼요.)

## 3단계. Render에 서버 켜기
1. render.com 에서 **New → Web Service** 를 눌러 방금 만든 GitHub 저장소를 연결해요.
2. 설정은 이렇게 해요.
   - Runtime: **Node**
   - Build Command: `npm install`
   - Start Command: `node server.js`
   - Instance Type: **Free**
3. **Environment Variables** 에 세 개를 넣어요.

   | 이름 | 값 |
   |---|---|
   | `SUPABASE_URL` | 1단계에서 메모한 Project URL |
   | `SUPABASE_KEY` | 1단계에서 메모한 Secret key |
   | `ADMIN_PIN` | 삭제할 때 쓸 관리자 비밀번호 (직접 정해요) |

4. **Create Web Service** 를 누르고 몇 분 기다리면 `https://이름.onrender.com` 주소가 생겨요. 그 주소를 QR코드로 만들어 부스에 붙이면 끝이에요.

## 쓰는 방법
- 누구나 주소로 들어와 물건을 올리고 "찾았어요"를 누를 수 있어요.
- **삭제는 관리자만** 해요. 화면 맨 아래의 **관리자**를 눌러 `ADMIN_PIN` 비밀번호를 넣으면 삭제 버튼이 보여요.
- 도배를 막으려고 한 사람이 1분에 8번까지만 올릴 수 있어요.

## 알아 둘 점
- **처음 접속이 느릴 수 있어요.** Render 무료 서버는 15분 동안 접속이 없으면 잠들고, 다시 열 때 1분쯤 걸려요. 축제 날 아침에 한 번 열어 두면 좋아요. 계속 깨워 두려면 UptimeRobot 같은 무료 모니터링 서비스로 `https://이름.onrender.com/healthz` 를 5분마다 확인하게 하는 방법이 있어요.
- **Supabase 무료 프로젝트는 일주일 동안 아무도 쓰지 않으면 일시 정지돼요.** 축제 전에 한 번 접속해 두면 돼요.
- **주소를 아는 사람은 누구나 글을 볼 수 있어요.** 인터넷에 공개되는 거라서, 연락처 칸에는 전화번호 대신 학년·반·이름만 적도록 안내돼 있어요. 학교에 공개 여부를 먼저 확인해 보세요.
- 행사가 끝나면 Supabase 프로젝트와 Render 서비스를 삭제하면 글과 사진이 모두 사라져요.

## 내 컴퓨터에서 먼저 시험해 보기 (선택)
Node.js 를 설치하고 이 폴더에서 `node server.js` 를 실행하면, 환경변수 없이도 `http://localhost:3000` 에서 동작해요. 이때는 `data` 폴더에 파일로 저장되고, 이 컴퓨터에서 접속하면 바로 관리자예요.
