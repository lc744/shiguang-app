// 临时探针：模拟器完整 UI 登录（云账号）
module.exports = async function evalInPage(page) {
  return await page.evaluate(async () => {
    const out = {};
    // 进入我的页 → 打开登录
    document.querySelector('.tab[data-target="page-profile"]').click();
    await new Promise(r => setTimeout(r, 400));
    document.querySelector('#userCard .user-row').click();
    await new Promise(r => setTimeout(r, 400));
    document.querySelector('#loginHome button').click(); // 第一个主按钮=邮箱注册/登录
    await new Promise(r => setTimeout(r, 400));
    document.getElementById('loginEmailInput').value = 'choumou-probe@shiguang-test.dev';
    document.getElementById('loginPassInput').value = 'Choumou#Probe2026';
    document.getElementById('emailSubmitBtn').click();
    await new Promise(r => setTimeout(r, 6000));
    out.overlay = document.getElementById('loginOverlay').style.display;
    out.card = document.getElementById('userCard').textContent.slice(0, 120);
    return JSON.stringify(out);
  });
};
