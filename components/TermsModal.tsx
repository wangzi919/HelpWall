import React, { useState } from 'react';

interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  actionType: 'post' | 'accept';
}

const TermsModal: React.FC<TermsModalProps> = ({ isOpen, onClose, onConfirm, actionType }) => {
  const [hasAgreed, setHasAgreed] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[90vh] flex flex-col rounded-[2rem] bg-white shadow-2xl transition-all animate-in zoom-in-95 duration-300 overflow-hidden">
        
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
            <span className="material-symbols-outlined text-red-500">gavel</span>
            服務條款與免責聲明
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 text-sm text-gray-600 leading-relaxed space-y-6">
          <section>
            <h3 className="font-bold text-gray-800 mb-2">一、平台角色聲明</h3>
            <p>本平台僅提供任務發送、任務承接及雙方溝通之資訊媒合服務，平台非任務當事人，亦不介入使用者間之實際履約行為、照顧行為或財產保管行為。所有任務之執行內容、方式、風險與結果，均由任務發送者與任務承接者自行協議並自行負責。</p>
          </section>

          <section>
            <h3 className="font-bold text-gray-800 mb-2">二、使用者責任與風險承擔</h3>
            <p>使用者於本平台發送或承接任何任務，即表示已充分理解並同意：任務可能涉及人身安全、動物照護、財產移動或其他風險行為。任務執行過程中所生之一切風險、損害或法律責任，應由任務雙方自行承擔。平台不保證任務承接者或任務發送者之身分、能力、專業資格或信用狀況。</p>
          </section>

          <section>
            <h3 className="font-bold text-gray-800 mb-2">三、責任免除條款</h3>
            <p>於法律允許之最大範圍內，平台對下列情形不負任何賠償或連帶責任，包括但不限於：</p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li><strong>人身相關風險：</strong>委託他人照顧兒童、長者或其他人員期間，發生受傷、失蹤、疾病、死亡等情事。</li>
              <li><strong>動物相關風險：</strong>委託照顧、遛狗、寄養或運送動物期間，發生走失、受傷、生病或死亡等情事。</li>
              <li><strong>財產相關風險：</strong>協助牽車、搬運、保管、維修或使用他人財物時，發生刮傷、損壞、遺失或滅失。</li>
              <li><strong>金錢糾紛：</strong>任務報酬之支付、未支付、延遲支付、金額爭議、退款或詐騙行為。</li>
            </ul>
            <p className="mt-2">前述任何爭議，均屬使用者雙方之私法糾紛，應由使用者自行協商或循法律途徑解決。</p>
          </section>

          <section>
            <h3 className="font-bold text-gray-800 mb-2">四、法律糾紛與資料提供</h3>
            <p>若因使用本平台服務而涉及司法機關、警察機關或其他依法有權機關之調查、命令或請求，平台得於法律允許範圍內，提供必要之使用者註冊資料、任務紀錄及平台內之訊息內容，以配合調查。使用者理解並同意，平台基於合法調查之資料提供行為，不構成對使用者之侵權或違約。</p>
          </section>

          <section>
            <h3 className="font-bold text-gray-800 mb-2">五、條款效力與準據法</h3>
            <p>本服務條款之解釋與適用，以中華民國法律為準據法。若本條款部分內容經法院認定無效，不影響其他條款之效力。</p>
          </section>
        </div>

        {/* Footer */}
        <div className="p-6 bg-gray-50 border-t border-gray-100 space-y-4">
          <label className="flex items-center gap-3 cursor-pointer group">
            <input 
              type="checkbox" 
              checked={hasAgreed}
              onChange={(e) => setHasAgreed(e.target.checked)}
              className="w-5 h-5 rounded border-gray-300 text-black focus:ring-black transition-all"
            />
            <span className="text-sm font-bold text-gray-700 group-hover:text-black">我已充分閱讀並同意上述服務條款</span>
          </label>

          <div className="flex gap-3">
            <button 
              onClick={onClose}
              className="flex-1 py-3 rounded-full font-bold text-gray-500 hover:bg-gray-200 transition-colors"
            >
              取消
            </button>
            <button 
              disabled={!hasAgreed}
              onClick={onConfirm}
              className={`flex-1 py-3 rounded-full font-black shadow-lg transition-all ${
                hasAgreed 
                ? 'bg-black text-white hover:scale-[1.02] active:scale-95' 
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {actionType === 'post' ? '確認發布' : '確認接取'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TermsModal;