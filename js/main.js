(function () {
  'use strict';

  const ROWS = 7;
  const STEP_SIZE = 10; // 미세 절삭 스텝 단위 (10px)
  const CUT_THRESHOLD = 6.5; // step 절삭 문턱 (6.5px 도달 시 다음 step으로 뚝 전환)
  const PRESS_MAGNITUDE = 2.5; // step 직전 수직선 압축/눌림 크기 (약 2~3px)
  const RECOIL_MAGNITUDE = 3.5; // 절삭 직후 미세 반동 크기 (3.5px)
  const RECOIL_DURATION = 60; // 반동 지속 시간 (60ms)

  const axisLeft = document.getElementById('axisLeft');
  const axisRight = document.getElementById('axisRight');
  const unitElements = Array.from(document.querySelectorAll('.rect-unit'));
  const textElements = Array.from(document.querySelectorAll('.text-layer'));

  // 7개 각 행별 공통 진행도 및 상태 (같은 행 좌우 막대가 100% 동일한 수치 공유)
  const rowStates = Array.from({ length: ROWS }, () => ({
    stepDist: 0,        // 공통 드래그 스냅 거리 (10px 단위)
    pressOffset: 0,     // 수직선 압축/눌림 오프셋 (0 ~ 2.5px)
    recoilOffset: 0,    // 절삭 직후 미세 반동 변위 (0 ~ 3.5px)
    isRecoiling: false,
    recoilAnimId: null,
    maxDist: 0          // 해당 행의 최대 이동 한도
  }));

  let activeRowIndex = -1;
  let activeDragSide = null;
  let dragStartPointerX = 0;
  let dragStartStepDist = 0;
  let currentLayout = null;

  class RectItem {
    constructor(element, textEl) {
      this.element = element;
      this.textEl = textEl;
      this.side = element.dataset.side; // 'left' | 'right'
      this.row = parseInt(element.dataset.row, 10);
      this.fillEl = element.querySelector('.rect-fill');
      this.lineTopEl = element.querySelector('.line-top');
      this.lineBottomEl = element.querySelector('.line-bottom');

      this.width = 0;
      this.height = 0;
      this.y = 0;
      this.initialX = 0;
      this.targetLineX = 0;

      this.bindEvents();
    }

    bindEvents() {
      this.element.addEventListener('pointerdown', (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        activeRowIndex = this.row;
        activeDragSide = this.side;
        dragStartPointerX = e.clientX;
        dragStartStepDist = rowStates[this.row].stepDist;

        // 같은 행의 좌우 막대 모두 dragging 클래스 부여
        const pair = rowPairs[this.row];
        pair.left.element.classList.add('is-dragging');
        pair.right.element.classList.add('is-dragging');

        e.preventDefault();
      });
    }
  }

  // 좌우 막대 인스턴스 생성 및 행별 쌍(Pair) 구성
  const items = unitElements.map((el) => {
    const side = el.dataset.side;
    const row = parseInt(el.dataset.row, 10);
    const matchingText = textElements.find(
      (t) => t.dataset.side === side && parseInt(t.dataset.row, 10) === row
    );
    return new RectItem(el, matchingText);
  });

  const rowPairs = Array.from({ length: ROWS }, (_, r) => ({
    left: items.find((it) => it.side === 'left' && it.row === r),
    right: items.find((it) => it.side === 'right' && it.row === r)
  }));

  // 각 행별 렌더링: 하나의 공통 state 값을 기반으로 좌우 완벽한 미러 대칭 렌더링
  function renderRow(rowIndex) {
    if (!currentLayout) return;
    const state = rowStates[rowIndex];
    const { left: leftItem, right: rightItem } = rowPairs[rowIndex];
    const { rectWidth, lineGap } = currentLayout;

    const stepDist = state.stepDist;
    const pressOffset = state.pressOffset;
    const recoilOffset = state.recoilOffset;

    // 1. 공통 수직선 통과 길이
    const passedLength = Math.max(0, stepDist - lineGap);

    // 2. 남은 검은 면의 시각적 길이 (좌우 100% 동일한 수치)
    const cutLength = Math.min(rectWidth, passedLength);

    // [좌측 바 렌더링]
    // 시각적 위치: 좌측 전진(-stepDist), 눌림(-pressOffset), 반동(+recoilOffset)
    const leftVisualX = leftItem.initialX - stepDist - pressOffset + recoilOffset;
    leftItem.element.style.transform = `translate3d(${leftVisualX.toFixed(2)}px, ${leftItem.y}px, 0)`;

    // 좌측 검은 면: 오른쪽(cutLength 이후)에 remainingWidth만큼 유지
    leftItem.fillEl.style.clipPath = `inset(0 0 0 ${cutLength}px)`;

    // 좌측 상·하단 선: 수직선과 틈새 없이 연결
    const leftLineTotalWidth = Math.max(rectWidth, passedLength);
    const leftLineClipRight = Math.max(0, leftLineTotalWidth - passedLength);
    leftItem.lineTopEl.style.left = '0px';
    leftItem.lineTopEl.style.width = leftLineTotalWidth + 'px';
    leftItem.lineTopEl.style.clipPath = `inset(0 ${leftLineClipRight}px 0 0)`;
    leftItem.lineBottomEl.style.left = '0px';
    leftItem.lineBottomEl.style.width = leftLineTotalWidth + 'px';
    leftItem.lineBottomEl.style.clipPath = `inset(0 ${leftLineClipRight}px 0 0)`;

    // 좌측 텍스트 reveal
    if (leftItem.textEl) {
      const textClipLeft = Math.max(0, rectWidth - passedLength);
      leftItem.textEl.style.clipPath = `inset(0 0 0 ${textClipLeft}px)`;
    }

    // [우측 바 렌더링 (좌측과 완전한 미러 대칭)]
    // 시각적 위치: 우측 전진(+stepDist), 눌림(+pressOffset), 반동(-recoilOffset)
    const rightVisualX = rightItem.initialX + stepDist + pressOffset - recoilOffset;
    rightItem.element.style.transform = `translate3d(${rightVisualX.toFixed(2)}px, ${rightItem.y}px, 0)`;

    // 우측 검은 면: 왼쪽(0부터)에 remainingWidth만큼 유지 (우측 cutLength 잘림)
    rightItem.fillEl.style.clipPath = `inset(0 ${cutLength}px 0 0)`;

    // 우측 상·하단 선: 수직선과 틈새 없이 연결
    const rightCutLocalX = rectWidth - passedLength;
    const rightLineOffsetLeft = Math.min(0, rightCutLocalX);
    const rightLineTotalWidth = rectWidth - rightLineOffsetLeft;
    const rightLineClipLeft = Math.max(0, rightCutLocalX - rightLineOffsetLeft);
    rightItem.lineTopEl.style.left = rightLineOffsetLeft + 'px';
    rightItem.lineTopEl.style.width = rightLineTotalWidth + 'px';
    rightItem.lineTopEl.style.clipPath = `inset(0 0 0 ${rightLineClipLeft}px)`;
    rightItem.lineBottomEl.style.left = rightLineOffsetLeft + 'px';
    rightItem.lineBottomEl.style.width = rightLineTotalWidth + 'px';
    rightItem.lineBottomEl.style.clipPath = `inset(0 0 0 ${rightLineClipLeft}px)`;

    // 우측 텍스트 reveal
    if (rightItem.textEl) {
      const textClipRight = Math.max(0, rectWidth - passedLength);
      rightItem.textEl.style.clipPath = `inset(0 ${textClipRight}px 0 0)`;
    }
  }

  // 절삭 시 좌우 막대 동시 미세 반동 트리거
  function triggerRowRecoil(rowIndex) {
    const state = rowStates[rowIndex];
    if (state.recoilAnimId) {
      cancelAnimationFrame(state.recoilAnimId);
    }
    state.isRecoiling = true;
    state.pressOffset = 0;

    const startTime = performance.now();
    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      if (elapsed >= RECOIL_DURATION) {
        state.recoilOffset = 0;
        state.isRecoiling = false;
        renderRow(rowIndex);
        state.recoilAnimId = null;
        return;
      }
      const progress = elapsed / RECOIL_DURATION;
      state.recoilOffset = RECOIL_MAGNITUDE * (1 - progress);
      renderRow(rowIndex);
      state.recoilAnimId = requestAnimationFrame(animate);
    };

    state.recoilOffset = RECOIL_MAGNITUDE;
    renderRow(rowIndex);
    state.recoilAnimId = requestAnimationFrame(animate);
  }

  // 윈도우 레벨 포인터 이동 리스너
  window.addEventListener('pointermove', (e) => {
    if (activeRowIndex === -1 || !currentLayout) return;

    const state = rowStates[activeRowIndex];
    const delta = (activeDragSide === 'left')
      ? (dragStartPointerX - e.clientX)
      : (e.clientX - dragStartPointerX);

    const rawDist = Math.max(0, dragStartStepDist + delta);
    const clampedRawDist = Math.min(state.maxDist, rawDist);

    const isAtOrPastVerticalLine = (state.stepDist >= currentLayout.lineGap);
    const prevStepDist = state.stepDist;

    if (!isAtOrPastVerticalLine) {
      // 수직선 도달 전: 일반 10px 스냅
      state.stepDist = Math.min(state.maxDist, Math.round(clampedRawDist / STEP_SIZE) * STEP_SIZE);
      state.pressOffset = 0;
    } else {
      // 수직선 통과 구간: 문턱(CUT_THRESHOLD) 기반 절삭 및 눌림
      const stepIndex = Math.floor(clampedRawDist / STEP_SIZE);
      const remainder = clampedRawDist % STEP_SIZE;

      let newStepDist = 0;
      if (remainder < CUT_THRESHOLD) {
        newStepDist = stepIndex * STEP_SIZE;
        const pressProgress = remainder / CUT_THRESHOLD;
        state.pressOffset = state.isRecoiling ? 0 : (pressProgress * PRESS_MAGNITUDE);
      } else {
        newStepDist = (stepIndex + 1) * STEP_SIZE;
        state.pressOffset = 0;
      }

      state.stepDist = Math.min(state.maxDist, newStepDist);

      if (state.stepDist > prevStepDist) {
        triggerRowRecoil(activeRowIndex);
      }
    }

    renderRow(activeRowIndex);
  }, { passive: false });

  function endDrag() {
    if (activeRowIndex !== -1) {
      const pair = rowPairs[activeRowIndex];
      pair.left.element.classList.remove('is-dragging');
      pair.right.element.classList.remove('is-dragging');

      const state = rowStates[activeRowIndex];
      state.pressOffset = 0;
      renderRow(activeRowIndex);

      activeRowIndex = -1;
      activeDragSide = null;
    }
  }

  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  function calculateLayout() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const centerX = vw / 2;

    const targetGroupHeight = Math.min(vh * 0.82, Math.max(300, vh - 40));
    const rectGap = Math.max(8, Math.min(18, Math.floor(targetGroupHeight * 0.024)));
    const rectHeight = Math.max(28, Math.floor((targetGroupHeight - ((ROWS - 1) * rectGap)) / ROWS));
    const totalGroupHeight = (ROWS * rectHeight) + ((ROWS - 1) * rectGap);
    const groupStartY = (vh - totalGroupHeight) / 2;

    const centerGap = Math.max(12, Math.min(20, Math.floor(vw * 0.012)));
    const centerGapHalf = centerGap / 2;
    const screenMargin = Math.max(16, Math.min(32, Math.floor(vw * 0.02)));
    const lineGap = Math.max(24, Math.min(36, Math.floor(vw * 0.022)));

    const availableHalf = centerX - screenMargin;
    const rectWidth = Math.max(120, Math.floor((availableHalf - centerGapHalf - (2 * lineGap)) / 2));

    const leftInitialX = centerX - centerGapHalf - rectWidth;
    const rightInitialX = centerX + centerGapHalf;

    const leftLineX = leftInitialX - lineGap;
    const rightLineX = rightInitialX + rectWidth + lineGap;

    axisLeft.style.left = leftLineX + 'px';
    axisRight.style.right = 'auto';
    axisRight.style.left = rightLineX + 'px';

    const leftMinX = screenMargin;
    const rightMaxX = vw - screenMargin - rectWidth;

    const targetFontByHeight = Math.floor(rectHeight * 0.83);
    const maxFontByWidth = Math.floor((rectWidth - 16) / 5.5);
    const commonFontSize = Math.max(16, Math.min(targetFontByHeight, maxFontByWidth));

    return {
      vw,
      vh,
      centerX,
      rectWidth,
      rectHeight,
      rectGap,
      groupStartY,
      leftLineX,
      rightLineX,
      leftInitialX,
      rightInitialX,
      leftMinX,
      rightMaxX,
      lineGap,
      commonFontSize
    };
  }

  function layout() {
    currentLayout = calculateLayout();
    const {
      rectWidth,
      rectHeight,
      rectGap,
      groupStartY,
      leftLineX,
      rightLineX,
      leftInitialX,
      rightInitialX,
      rightMaxX,
      lineGap,
      commonFontSize
    } = currentLayout;

    // 각 행별 지오메트리 설정 및 기준 길이 동기화
    for (let r = 0; r < ROWS; r++) {
      const state = rowStates[r];
      const { left: leftItem, right: rightItem } = rowPairs[r];

      // 이전 진행률 보존
      const prevRatio = (state.maxDist > 0) ? (state.stepDist / state.maxDist) : 0;

      const y = groupStartY + r * (rectHeight + rectGap);

      // 좌측 아이템 배치
      leftItem.width = rectWidth;
      leftItem.height = rectHeight;
      leftItem.y = y;
      leftItem.initialX = leftInitialX;
      leftItem.targetLineX = leftLineX;
      leftItem.element.style.width = rectWidth + 'px';
      leftItem.element.style.height = rectHeight + 'px';

      if (leftItem.textEl) {
        leftItem.textEl.style.width = rectWidth + 'px';
        leftItem.textEl.style.height = rectHeight + 'px';
        leftItem.textEl.style.top = y + 'px';
        leftItem.textEl.style.fontSize = commonFontSize + 'px';
        leftItem.textEl.style.left = (leftLineX - rectWidth) + 'px';
      }

      // 우측 아이템 배치
      rightItem.width = rectWidth;
      rightItem.height = rectHeight;
      rightItem.y = y;
      rightItem.initialX = rightInitialX;
      rightItem.targetLineX = rightLineX;
      rightItem.element.style.width = rectWidth + 'px';
      rightItem.element.style.height = rectHeight + 'px';

      if (rightItem.textEl) {
        rightItem.textEl.style.width = rectWidth + 'px';
        rightItem.textEl.style.height = rectHeight + 'px';
        rightItem.textEl.style.top = y + 'px';
        rightItem.textEl.style.fontSize = commonFontSize + 'px';
        rightItem.textEl.style.left = rightLineX + 'px';
      }

      // 같은 행의 텍스트 너비 측정하여 좌우 동일한 maxDist 부여
      const leftSpan = leftItem.textEl ? leftItem.textEl.querySelector('span') : null;
      const rightSpan = rightItem.textEl ? rightItem.textEl.querySelector('span') : null;
      const leftSpanWidth = leftSpan ? leftSpan.getBoundingClientRect().width : 0;
      const rightSpanWidth = rightSpan ? rightSpan.getBoundingClientRect().width : 0;
      const maxSpanWidth = Math.max(leftSpanWidth, rightSpanWidth);

      // '날'(r=1, r=4) 단어 잘림 방지 16px 패딩을 좌우 동일하게 적용하여 완벽 대칭 유지
      const textContent = leftSpan ? leftSpan.textContent.trim() : '';
      const isNal = (textContent === '날');
      const endPadding = isNal ? 16 : 0;

      const fullRevealDist = maxSpanWidth + 10 + endPadding;
      const rowMaxDist = Math.ceil((fullRevealDist + lineGap) / STEP_SIZE) * STEP_SIZE;
      const maxAvailable = rightMaxX - rightInitialX;
      state.maxDist = Math.min(maxAvailable, rowMaxDist);

      // 진행 거리 갱신
      state.stepDist = Math.round((prevRatio * state.maxDist) / STEP_SIZE) * STEP_SIZE;
      state.pressOffset = 0;

      renderRow(r);
    }
  }

  window.addEventListener('resize', () => {
    layout();
  });

  layout();

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      layout();
    });
  }

  // 외부 인터페이스 및 테스트 제어
  window.kineticBars = {
    items: items,
    rowStates: rowStates,
    reset: function () {
      for (let r = 0; r < ROWS; r++) {
        rowStates[r].stepDist = 0;
        rowStates[r].pressOffset = 0;
        rowStates[r].recoilOffset = 0;
        renderRow(r);
      }
    },
    revealAll: function () {
      for (let r = 0; r < ROWS; r++) {
        rowStates[r].stepDist = rowStates[r].maxDist;
        rowStates[r].pressOffset = 0;
        rowStates[r].recoilOffset = 0;
        renderRow(r);
      }
    },
    moveRow: function (rowIndex, dist) {
      if (rowStates[rowIndex]) {
        rowStates[rowIndex].stepDist = Math.max(0, Math.min(rowStates[rowIndex].maxDist, dist));
        renderRow(rowIndex);
      }
    }
  };

  window.addEventListener('keydown', (e) => {
    if (e.key === 'r' || e.key === 'R') {
      window.kineticBars.revealAll();
    }
  });

  const urlParams = new URLSearchParams(window.location.search);
  const autoReveal = urlParams.get('reveal') === '1';

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      layout();
      if (autoReveal) {
        window.kineticBars.revealAll();
      }
    });
  } else if (autoReveal) {
    window.kineticBars.revealAll();
  }
})();
