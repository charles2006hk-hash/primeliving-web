'use client';

import React, { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function LegalContent() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  
  let defaultTab: 'privacy' | 'terms' | 'refund' = 'privacy';
  if (tabParam === 'terms') defaultTab = 'terms';
  if (tabParam === 'refund') defaultTab = 'refund';

  const [activeTab, setActiveTab] = useState<'privacy' | 'terms' | 'refund'>(defaultTab);

  return (
    <div className="min-h-screen bg-slate-50 pt-24 pb-12 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        
        {/* 三大合規標籤切換 */}
        <div className="flex border-b border-slate-200 bg-slate-50">
          <button 
            onClick={() => setActiveTab('privacy')} 
            className={`flex-1 py-4 text-xs sm:text-sm font-bold transition ${activeTab === 'privacy' ? 'text-orange-600 border-b-2 border-orange-600 bg-white' : 'text-slate-500 hover:text-slate-700'}`}
          >
            隱私政策 (Privacy Policy)
          </button>
          <button 
            onClick={() => setActiveTab('terms')} 
            className={`flex-1 py-4 text-xs sm:text-sm font-bold transition ${activeTab === 'terms' ? 'text-orange-600 border-b-2 border-orange-600 bg-white' : 'text-slate-500 hover:text-slate-700'}`}
          >
            服務條款 (Terms of Service)
          </button>
          <button 
            onClick={() => setActiveTab('refund')} 
            className={`flex-1 py-4 text-xs sm:text-sm font-bold transition ${activeTab === 'refund' ? 'text-orange-600 border-b-2 border-orange-600 bg-white' : 'text-slate-500 hover:text-slate-700'}`}
          >
            退款與取消政策 (Refund & Cancellation)
          </button>
        </div>

        {/* 條款內容 */}
        <div className="p-6 md:p-10 text-sm text-slate-700 leading-loose text-justify h-[70vh] overflow-y-auto custom-scrollbar">
          
          {/* 1. 隱私政策 */}
          {activeTab === 'privacy' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-black text-slate-900 mb-6">隱私政策聲明 (Privacy Policy)</h2>
              <p>香港佳寓物業管理有限公司（Prime Living Property (HK) Management Limited，下稱「本公司」或「佳寓」）尊重個人資料隱私，並承諾全面落實及遵守香港特別行政區《個人資料（私隱）條例》（第486章）的規定。</p>
              
              <h3 className="text-lg font-bold text-slate-800 border-l-4 border-orange-500 pl-3">1. 資料收集與使用</h3>
              <p>我們收集的個人資料（包括但不限於姓名、香港身份證號碼/護照號碼、聯絡電話、微信號、電子郵件、支付及租約紀錄）將僅用於以下目的：提供物業租賃服務、辦理線上支付與退款、辦理租約及印花稅手續、身份核實、租金收取與追討、處理日常維修及管家服務。</p>

              <h3 className="text-lg font-bold text-slate-800 border-l-4 border-orange-500 pl-3">2. 資料轉移與安全</h3>
              <p>本公司採用加密技術保護您的線上交易與個人數據。線上支付程序將由具備 PCI-DSS 認證的第三方支付網關（如 PayDollar / AsiaPay）全權處理，本公司不會儲存您的完整信用卡卡號數據。</p>

              <h3 className="text-lg font-bold text-slate-800 border-l-4 border-orange-500 pl-3">3. 資料保留與查閱</h3>
              <p>本公司將合理保存您的個人資料直至履行上述目的所需的期限屆滿。租客有權隨時要求查閱或更正其存於本公司系統內的個人資料。</p>
            </div>
          )}

          {/* 2. 服務條款 */}
          {activeTab === 'terms' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-black text-slate-900 mb-6">服務條款 (Terms & Conditions)</h2>
              <p>歡迎使用香港佳寓物業管理有限公司（下稱「本公司」）提供之官方網站及線上系統。使用本服務即表示您同意受以下條款約束：</p>

              <h3 className="text-lg font-bold text-slate-800 border-l-4 border-orange-500 pl-3">1. 交易幣別與交易主體</h3>
              <p>本網站上所有金額與費用均以 <strong>港幣 (HKD)</strong> 結算與支付。交易開立發票與服務提供主體為香港佳寓物業管理有限公司（商業登記號碼：80097524）。</p>

              <h3 className="text-lg font-bold text-slate-800 border-l-4 border-orange-500 pl-3">2. 服務性質與合約約束</h3>
              <p>本網站提供線上訂房、租金與按金預繳、電子對數與管家服務。所有租賃關係之權利與義務，均以雙方簽署之《租用協議 (Licence Agreement)》或《租賃合約 (Tenancy Agreement)》為最終準則。</p>

              <h3 className="text-lg font-bold text-slate-800 border-l-4 border-orange-500 pl-3">3. 司法管轄區</h3>
              <p>本條款受香港特別行政區法律管轄，並按其解釋。雙方同意受香港法院的專屬司法管轄權管轄。</p>
            </div>
          )}

          {/* 3. 退款與取消政策 (PayDollar 審核重點) */}
          {activeTab === 'refund' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-black text-slate-900 mb-6">取消與退款政策 (Cancellation & Refund Policy)</h2>
              <p>香港佳寓物業管理有限公司（下稱「本公司」）制定以下預訂取消與退款規則，適用於經由官網與線上支付網關（如 PayDollar）進行的所有交易：</p>

              <h3 className="text-lg font-bold text-slate-800 border-l-4 border-orange-500 pl-3">1. 預訂押金 / 訂金 (Deposit Policy)</h3>
              <ul className="list-disc pl-5 space-y-1">
                <li>租客經線上支付之預訂押金/訂金，用於為租客鎖定指定單位與房間庫存。</li>
                <li>除條款 5.3.1 指定之特殊情況（簽約 2 日內修讀課程宣佈取消面授並提供官方證明）外，若租客在簽約後因個人原因放棄入住，已繳付之押金將不予退還。</li>
              </ul>

              <h3 className="text-lg font-bold text-slate-800 border-l-4 border-orange-500 pl-3">2. 退租與押金退還機制 (Contract Completion Refund)</h3>
              <p>合約期滿且租客辦理完成正常退宿點交手續後，經本公司驗收房屋設施無人為損壞及無欠繳水電/租金費用情況下，押金將於 <strong>14 個工作天內</strong>（不包括週六、日及香港公眾假期）無息退還至租客指定之銀行帳戶或原支付管道。</p>

              <h3 className="text-lg font-bold text-slate-800 border-l-4 border-orange-500 pl-3">3. 線上多繳 / 重複支付退款 (Overpayment & Dispute)</h3>
              <p>若因系統故障或操作失誤導致多繳或重複扣款，請於 7 天內聯繫我們的官方客服 (info@primelivinghk.com)。經確認後，多餘款項將於 <strong>7-14 個工作天內</strong> 經由 PayDollar 原路退回至您的信用卡或原支付帳戶。</p>

              <h3 className="text-lg font-bold text-slate-800 border-l-4 border-orange-500 pl-3">4. 退款手續費說明</h3>
              <p>非本公司原因導致的退款申請，若經由信用卡或 PayDollar 辦理原路退款，支付網關可能扣除不超過 3% 的交易手續費，實際退款金額以最終入款金額為準。</p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

export default function LegalPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-500">載入中...</div>}>
      <LegalContent />
    </Suspense>
  );
}
