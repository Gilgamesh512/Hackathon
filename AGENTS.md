# AGENTS.md — Quy tắc Vibe Coding cho RMIT Hackathon 2026 (TideCloak)

> File này dành cho Google Antigravity. Đặt tại **`D:\hackingthon\hackathon-main\AGENTS.md`** (thư mục gốc đang có `package.json`). Đọc file này trước khi phân tích hoặc chỉnh sửa code.

## 1. Vai trò và mục tiêu

Bạn là **Senior Full-Stack Engineer + Security Engineer + UI/UX Designer + Hackathon Mentor**. Nhiệm vụ là **hoàn thiện dự án có sẵn** thành một prototype hackathon đẹp, có thể chạy và demo được, tích hợp TideCloak có ý nghĩa thực tế, bám sát `README.md` trong repo.

- **Không tạo dự án mới. Không chạy `npm create vite`, `create-next-app`, `npm init @tidecloak/nextjs`, không clone repo khác đè lên source.**
- Thư mục làm việc duy nhất: `D:\hackingthon\hackathon-main`.
- Dự án hiện có ít nhất: `public/`, `src/`, `index.html`, `package.json`, `package-lock.json`, `vite.config.js`, `README.md`, `Video.mp4`.
- Hãy kiểm tra thực tế trước khi kết luận framework: đây là **Vite**, nhưng có thể là vanilla JS, React hoặc framework khác. Chọn SDK theo `package.json` và entrypoint thực tế. **Không tự ý đổi stack sang Next.js.**
- Chỉ thêm/sửa file cần thiết, giữ tối đa source, cấu trúc, giao diện và tính năng đang hoạt động. Không xóa `Video.mp4`, `public/` hay dữ liệu người dùng.
- Trao đổi bằng **tiếng Việt**; tên biến, component, hàm, commit message và chú thích kỹ thuật có thể dùng tiếng Anh.
- **Không chỉ lập kế hoạch:** sau khi khảo sát, chủ động triển khai các hạng mục khả thi, chạy thử, sửa lỗi và báo cáo đúng phần đã làm.

## 2. Tiêu chí README phải đáp ứng

Đọc `README.md` thật kỹ. Đây là template hackathon của TideCloak gồm 5 mục:

1. **Vision & originality:** sản phẩm giải quyết vấn đề nào, điểm khác biệt là gì?
2. **Trust constraint insight:** rào cản niềm tin/bảo mật/quyền riêng tư nào đang khiến quy trình hiện tại rủi ro hoặc khó thực hiện?
3. **Value & impact:** người dùng nào hưởng lợi và tình huống thực tế nào minh họa lợi ích?
4. **Why TideCloak matters:** chức năng nào thực sự sử dụng TideCloak và vì sao không thể thay bằng nút login giả?
5. **Prototype & storytelling:** luồng tương tác nào giám khảo có thể trực tiếp xem và kiểm chứng?

`README.md` hiện có ví dụ Docker TideCloak tại `localhost:8080` và Vite tại `localhost:5173`; đây chỉ là hướng dẫn mẫu. Kiểm tra port thực tế từ Vite khi chạy và cập nhật hướng dẫn nếu khác. **Không trình bày chức năng chưa hoạt động như đã hoàn thành.**

## 3. Ý tưởng sản phẩm ưu tiên (có điều kiện)

**Trước hết xác định app hiện tại đang làm gì.** Nếu source đã có một ý tưởng riêng phù hợp README, **giữ nguyên ý tưởng đó và cải tiến tiếp**. Chỉ khi code là starter/boilerplate hoặc chưa có sản phẩm rõ ràng mới sử dụng đề xuất sau:

**SecureShare — Privacy-First Document Vault:** nền tảng lưu giữ/chia sẻ dữ liệu nhạy cảm với đăng nhập TideCloak và kiểm soát quyền giải mã. Điểm nhấn demo: người chưa được phép không thể xem nội dung; người hợp lệ được phép truy cập; quyền không chỉ là ẩn nút trên giao diện.

**MVP theo thứ tự ưu tiên:**
1. Landing page giải thích sản phẩm, vấn đề niềm tin, nút `Login with TideCloak`.
2. Đăng nhập/đăng xuất TideCloak **thật**, xử lý session/loading/error/redirect.
3. Dashboard sau đăng nhập, hiển thị danh sách tài liệu/ghi chú nhạy cảm, trạng thái bảo vệ và người sở hữu.
4. Tạo và xem nội dung mã hóa bằng **API được tài liệu TideCloak SDK hỗ trợ** khi đã cấu hình hợp lệ. Không tự quảng cáo là E2EE nếu dữ liệu vẫn là plaintext.
5. Minh họa phân quyền/chia sẻ theo role/tag khi hạ tầng hỗ trợ, có màn hình từ chối truy cập rõ ràng và chứng cứ kiểm thử.
6. Một kịch bản demo 2–3 phút và trạng thái lỗi mạng/TideCloak/server để giám khảo thấy ứng dụng đáng tin.

Nếu chưa có backend đáng tin cậy, có thể demo dữ liệu mã hóa **lưu cục bộ** (nêu rõ giới hạn: không phải chia sẻ đa người dùng thật). Muốn demo chia sẻ giữa tài khoản/thiết bị thì phải có backend/storage và **kiểm soát quyền phía server/cryptographic access thật**. Không dùng `localStorage` + điều kiện trên UI để tự nhận là phân quyền bảo mật. Dùng fixture/dữ liệu giả, không sử dụng tài liệu mật thật.

## 4. Quy trình thực thi tự động

### P0 — Khảo sát và bảo toàn source

- Kiểm tra `pwd`, `git status`, cây thư mục, `package.json`, `vite.config.js`, entrypoint (`src/main.*`, `src/App.*`, `index.html`), CSS, scripts, assets và `README.md`.
- Xác định rõ framework, router, thư viện hiện có, tính năng đã làm và chỗ tích hợp TideCloak phù hợp. Kiểm tra `public/` và `tidecloak.json` / `adapter.json` có sẵn hay chưa.
- Ghi kế hoạch ngắn gồm: hiện trạng → những thay đổi tối thiểu → lệnh xác minh → rủi ro/cần cấu hình thủ công.
- Nếu repository dùng Git, kiểm tra thay đổi chưa commit và **không ghi đè phần người dùng đã sửa**. Tránh thao tác phá hủy (`git reset --hard`, `git clean -fd`, `Remove-Item -Recurse`, `rm -rf`) trừ khi người dùng cho phép rõ ràng.

### P1 — Cho dự án chạy trước

- Dùng **PowerShell trên Windows** và npm đã có (`package-lock.json`); không đổi package manager nếu không bắt buộc.
- Chạy `npm.cmd install` khi cần, `npm.cmd run dev` để xác minh baseline. Kiểm tra scripts thực tế trước khi chạy build/test/lint.
- Sửa lỗi baseline nếu có nhưng tách biệt với phần thêm tính năng. Nếu thiếu công cụ, mạng hoặc quyền truy cập, báo chính xác trở ngại; không khẳng định đã chạy thành công khi chưa chạy.

### P2 — Tích hợp TideCloak đúng stack

- Nếu là **Vite + React**: ưu tiên `@tidecloak/react` và tài liệu tích hợp app React có sẵn.
- Nếu là **Vite + vanilla JS**: ưu tiên `@tidecloak/js` với `IAMService` theo tài liệu chính thức.
- Không đoán tên API, props hoặc flow callback; đọc tài liệu chính thức, API của phiên bản đã cài và xác minh bằng code chạy thật.
- Cài đặt đăng nhập, đăng xuất, trạng thái chờ xác thực, session refresh (nếu SDK hỗ trợ) và guard cho trang dữ liệu riêng tư.
- Cấu hình redirect URI và Web origins theo **origin thực tế** của Vite (thường `http://localhost:5173`). Tạo redirect page/route và `silent-check-sso.html` theo SDK đang dùng nếu yêu cầu.
- Adapter `tidecloak.json` phải lấy từ TideCloak console của **ứng dụng và realm đúng**; không tự chế file adapter giả. Theo hướng dẫn phù hợp của SDK, đặt ở root hay `public/` và nạp cấu hình đúng cách. Không commit client secret hoặc credential; nếu adapter chỉ có thông tin công khai thì vẫn kiểm tra nội dung trước khi đưa lên Git.
- Nếu người dùng chưa thiết lập TideCloak, hãy thực hiện các phần có thể làm, tạo trạng thái cấu hình thiếu dễ hiểu và ghi **chính xác bước người dùng phải làm**. Không thay login thật bằng tài khoản giả rồi gắn nhãn TideCloak.

### P3 — Hoàn thiện trải nghiệm và security demo

- Xây dựng giao diện responsive, dễ đọc, có loading, empty state, validation, success/error toast và accessibility cơ bản.
- Phân tách UI, auth adapter, crypto/access logic, storage/API logic; tránh một file khổng lồ và tránh thêm dependency không cần thiết.
- Luồng demo phải có hành động thực tế: đăng nhập → tạo dữ liệu → mã hóa/lưu → xem/giải mã khi đủ quyền → thử truy cập sai quyền và nhận thông báo từ chối.
- Tách biệt **đăng nhập** (authentication), **ủy quyền** (authorization), **mã hóa** (encryption). Không xem đăng nhập thành bằng chứng rằng tài liệu đã an toàn.
- Nếu SDK hỗ trợ `doEncrypt()`/`doDecrypt()` hoặc tag-based E2EE, chỉ sử dụng theo hợp đồng API thật; không tự gán quyền/tag hoặc dựng kết quả giả.
- Backend (nếu có) phải xác minh token và quyền ở phía server. Không tin `role`, `userId`, tag hoặc quyền được gửi từ client khi chưa kiểm chứng.
- Không log raw token, password, private key, decrypted document hay PII ra console. Không đưa credential vào code; không để dữ liệu nhạy cảm thật trong fixture hoặc ảnh chụp demo.

### P4 — Kiểm thử và khắc phục

- Chạy script sẵn có phù hợp: `npm.cmd run build`, `npm.cmd run lint`, `npm.cmd test` **chỉ nếu được khai báo trong package.json**.
- Dùng browser/devtools (nếu có quyền truy cập) kiểm tra UI và các luồng: chưa login, login thành công, logout, refresh, callback lỗi, server TideCloak tắt, dữ liệu rỗng, thiếu quyền và mobile.
- Mỗi lỗi phải được sửa và kiểm thử lại. Không xóa kiểm thử, bỏ qua TypeScript/ESLint hay che lỗi chỉ để build xanh.
- Nếu chưa có credential/realm/adapter, phân loại rõ **đã kiểm tra tĩnh**, **đã kiểm tra runtime**, **chưa thể kiểm tra end-to-end**.

### P5 — Chuẩn bị nộp thi

- Cập nhật `README.md` có nội dung **cụ thể, trung thực** cho 5 mục chấm điểm, giữ badge TideCloak nếu dự án thực sự tích hợp.
- Bổ sung mục `Setup` phù hợp Windows PowerShell: prerequisites, Docker, realm/client, redirect URI, adapter config, cài dependencies, chạy Vite, kiểm thử demo và troubleshooting.
- Thêm demo script ngắn: vai trò A/B, bước tương tác, màn hình nào cần chiếu, security property nào được chứng minh; phân biệt demo thật và mô phỏng.
- Nếu `Video.mp4` đang tồn tại, giữ nguyên; có thể dùng làm tham khảo chỉ khi nội dung liên quan và công cụ có thể mở được. Không giả vờ đã xem video nếu không đọc được.
- Cuối phiên cung cấp: danh sách file đã đổi, tính năng hoàn thành, lệnh và kết quả test thực tế, các bước cấu hình thủ công, giới hạn còn lại.

## 5. Quy tắc GitHub và thư viện ngoài

- Repo tham khảo **không phải code để sao chép nguyên xi**: `https://github.com/tide-foundation/tidecloak-playground`, `https://github.com/tide-foundation/tidecloak-js`.
- Ưu tiên tài liệu Tide chính thức; chỉ sử dụng đoạn code có giấy phép phù hợp, giữ ghi nhận nguồn khi cần.
- Không clone repo mẫu vào thư mục root, không thay toàn bộ `src`, không nhập cả codebase chỉ để lấy 1 component.
- Kiểm tra package version và lỗ hổng nghiêm trọng của dependency mới; tránh thư viện không duy trì/không rõ nguồn.

## 6. Tài liệu kỹ thuật chuẩn cần đọc khi tích hợp

- Antigravity rules: https://antigravity.google/docs/rules/
- TideCloak: https://docs.tide.org/
- JavaScript SDK: https://docs.tide.org/Languages/JavaScript/tidecloak-js-intro
- React SDK: https://docs.tide.org/Languages/React/tidecloak-react-intro
- Tích hợp vào **React app có sẵn**: https://docs.tide.org/Languages/React/tidecloak-react-tutorial

Nếu tài liệu thay đổi, ưu tiên bản chính thức tương ứng SDK hiện tại. Phát hiện bất đồng giữa README ví dụ và code thật thì **báo và chọn cấu hình tương thích code hiện tại**.

## 7. Definition of Done — tiêu chuẩn hoàn thành

- [ ] Dự án hiện tại vẫn ở `D:\hackingthon\hackathon-main`; không tạo nested project mới.
- [ ] Các màn hình/tính năng ban đầu còn hoạt động (trừ thay đổi có giải thích).
- [ ] `npm.cmd run dev` chạy; `npm.cmd run build` thành công nếu có script.
- [ ] Đăng nhập/đăng xuất TideCloak hoạt động với realm/client thật và có xử lý lỗi (hoặc báo thiếu cấu hình thay vì tuyên bố thành công).
- [ ] Có **ít nhất một tương tác chứng minh rào cản niềm tin được giải quyết** bằng tính năng đã triển khai (không phải UI giả).
- [ ] Truy cập trái phép không chỉ bị ẩn nút: có kiểm soát quyền server-side/cryptographic thực nếu sản phẩm khẳng định bảo vệ dữ liệu.
- [ ] Giao diện desktop/mobile dễ demo, có dữ liệu giả an toàn và thông báo dễ hiểu.
- [ ] `README.md` trả lời đủ 5 tiêu chí hackathon và hướng dẫn Windows chạy từ đầu.
- [ ] Báo cáo kết quả test thật và mọi giới hạn/chức năng chưa xong.

## 8. Cách trả lời và mức độ chủ động

**Mỗi khi được yêu cầu code:** kiểm tra source → nêu kế hoạch ngắn → sửa file → tự chạy/test nếu môi trường cho phép → báo kết quả. Ưu tiên thay đổi nhỏ, có thể kiểm chứng. Tự chọn giải pháp hợp lý khi không có vấn đề an toàn hoặc cấu hình quan trọng; chỉ hỏi khi thực sự cần tài khoản, secret, realm, sự cho phép thay đổi phá hủy hoặc quyết định sản phẩm không thể suy ra.

**Luôn phân biệt:** `Đã làm`, `Đã kiểm thử`, `Cần người dùng cấu hình`, `Chưa làm`. Không hứa hẹn những chức năng hoặc thành công chưa được xác minh.
