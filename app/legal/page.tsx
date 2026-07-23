'use client';

import React, { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function LegalContent() {
  const searchParams = useSearchParams();
  const defaultTab = searchParams.get('tab') === 'terms' ? 'terms' : 'privacy';
  const [activeTab, setActiveTab] = useState<'privacy' | 'terms'>(defaultTab);

  return (
    <div className="min-h-screen bg-slate-50 pt-24 pb-12 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        
        {/* 標籤切換導航 */}
        <div className="flex border-b border-slate-200 bg-slate-50">
          <button 
            onClick={() => setActiveTab('privacy')} 
            className={`flex-1 py-4 text-sm font-bold transition ${activeTab === 'privacy' ? 'text-orange-600 border-b-2 border-orange-600 bg-white' : 'text-slate-500 hover:text-slate-700'}`}
          >
            隱私政策 (Privacy Policy)
          </button>
          <button 
            onClick={() => setActiveTab('terms')} 
            className={`flex-1 py-4 text-sm font-bold transition ${activeTab === 'terms' ? 'text-orange-600 border-b-2 border-orange-600 bg-white' : 'text-slate-500 hover:text-slate-700'}`}
          >
            服務條款 (Terms of Service)
          </button>
        </div>

        {/* 內容區域 */}
        <div className="p-8 md:p-12 text-sm text-slate-700 leading-loose text-justify h-[70vh] overflow-y-auto custom-scrollbar">
          {activeTab === 'privacy' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-black text-slate-900 mb-6">隱私政策聲明</h2>
              <p>香港佳寓物業管理有限公司（Prime Living Property (HK) Management Limited，下稱「本公司」或「佳寓」）尊重個人資料隱私，並承諾全面落實及遵守香港特別行政區《個人資料（私隱）條例》（第486章）的規定。</p>
              
              <h3 className="text-lg font-bold text-slate-800 border-l-4 border-orange-500 pl-3">1. 資料收集與使用</h3>
              <p>我們收集的個人資料（包括但不限於姓名、香港身份證號碼/護照號碼、聯絡電話、微信號、財務及租約紀錄）將僅用於以下目的：提供物業租賃服務、辦理租約及印花稅手續、身份核實、租金收取與追討、處理日常維修及管家服務。</p>

              <h3 className="text-lg font-bold text-slate-800 border-l-4 border-orange-500 pl-3">2. 資料轉移與聯營機構共享</h3>
              <p>為提供更完善的居住體驗與配套服務，本公司可能將您的部分必要資料與我們的戰略聯營機構（包括 <strong>金港灣集團有限公司 GOLDEN HARBOUR GROUP LIMITED</strong>）及官方授權之第三方服務供應商（如清潔公司、維修承辦商）共享。除上述情況及法律強制規定外，本公司絕不會將您的資料出售或披露予無關之第三方。</p>

              <h3 className="text-lg font-bold text-slate-800 border-l-4 border-orange-500 pl-3">3. 資料保留與查閱</h3>
              <p>本公司將合理保存您的個人資料直至履行上述目的所需的期限屆滿。租客有權隨時要求查閱或更正其存於本公司系統內的個人資料。</p>
            </div>
          )}

          {activeTab === 'terms' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-black text-slate-900 mb-6">服務條款</h2>
              <p>歡迎使用香港佳寓物業管理有限公司（下稱「本公司」）提供之官方網站及線上系統。使用本服務即表示您同意受以下條款約束：</p>

              <h3 className="text-lg font-bold text-slate-800 border-l-4 border-orange-500 pl-3">1. 服務性質與免責聲明</h3>
              <p>本網站提供之盤源資訊、租金報價及合約智能解析結果僅供參考。所有租賃關係之權利與義務，均以雙方最終簽署之實體或具法律效力之電子《租用協議 (Licence Agreement)》或《租賃合約 (Tenancy Agreement)》為準。本公司不對因系統延遲、網絡故障或第三方攻擊導致的數據遺失承擔直接賠償責任。</p>

              <h3 className="text-lg font-bold text-slate-800 border-l-4 border-orange-500 pl-3">2. 智能合約與電子簽署</h3>
              <p>租客透過本系統確認、同意或透過電子方式簽署之所有租務文件、分期帳單及催繳通知，均具有同等法律效力。租客有責任妥善保管其登入憑證，任何經由其帳戶發出之操作均視為租客本人之真實意願。</p>

              <h3 className="text-lg font-bold text-slate-800 border-l-4 border-orange-500 pl-3">3. 違約與權利保留</h3>
              <p>若租客未能按時繳付租金或嚴重違反公寓管理規定，本公司有絕對權利終止服務、收回物業，並將相關欠款紀錄及個人資料轉交予收數機構或執法部門。本公司保留隨時修改本條款之權利，修改後即時生效。</p>
              
              <h3 className="text-lg font-bold text-slate-800 border-l-4 border-orange-500 pl-3">4. 司法管轄區</h3>
              <p>本條款受香港特別行政區法律管轄，並按其解釋。雙方同意受香港法院的專屬司法管轄權管轄。</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 必須使用 Suspense 包裹以支援 Next.js 的 client-side useSearchParams
export default function LegalPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-500">載入中...</div>}>
      <LegalContent />
    </Suspense>
  );
}
