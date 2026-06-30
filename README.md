# 🤖 Platoboost Auto Bypass Discord Bot

Một bot Discord đơn giản giúp tự động bẻ khóa (bypass) link Platoboost và các dịch vụ rút gọn link (Lootlabs, Linkvertise, Work.ink...). Chỉ cần thả link vào kênh chat, bot sẽ tự động làm hết! 🚀

---

## ⚠️ Lưu Ý Quan Trọng (Đọc kỹ trước khi xài)

* ⏳ **Thời gian Bypass:** Quá trình giải mã và vượt link có thể mất từ **15 giây tới 5 phút** tùy thuộc vào loại link rút gọn (Lootlabs, Cloudflare, giải Captcha...). Anh em kiên nhẫn chờ bot xử lý nhé, đừng vội spam!
* 🐧 **Độ ổn định:** Source code này viết còn **hơi lỏ 1 tí** =))) Do các trang rút gọn liên tục cập nhật thuật toán nên đôi lúc bot sẽ lăn ra chết hoặc bypass xịt. Anh em dùng tạm, có lỗi thì tự sửa hoặc thông cảm nha.

---

## 🌟 Tính Năng Chính

* ✅ Tự động nhận diện link `auth.platorelay.com/a?d=` trong tin nhắn.
* ✅ Bypass trực tiếp **Platoboost** (Gateway / Auth).
* ✅ Hỗ trợ bypass các link trung gian:
  * `Loot.link` / `Lootlabs.gg`
  * `Linkvertise.com` (death not working)
  * `Bull shit out`
  * `Boost.ink`
* ✅ Tích hợp thuật toán tự động giải mã Captcha GIF (Coherence / Driftodd) của hệ thống Platoboost.
* ✅ Trả kết quả trực tiếp bằng Embed đẹp mắt trên Discord.

---

## ⚙️ Yêu Cầu Cài Đặt

Trước khi chạy bot, hãy đảm bảo máy tính hoặc VPS của bạn đã cài đặt sẵn:
* **Node.js** (Phiên bản 18.x trở lên)
* Trình duyệt **Chromium/Chrome** (Dành cho Puppeteer để vượt Cloudflare của Lootlabs)

