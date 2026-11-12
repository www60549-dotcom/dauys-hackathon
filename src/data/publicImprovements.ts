/** Curated, synthetic public summaries. Never derive public content from internal tickets. */
export interface PublicImprovement {
  slug: string;
  title: string;
  summary: string;
  outcome: string;
}

export const publicImprovements: readonly PublicImprovement[] = [
  {slug: 'learning-meetings', title: 'Короткие учебные встречи',
    summary: 'Встречи по новым товарным линейкам помогают разбирать типовые рабочие вопросы.',
    outcome: 'В демонстрационном сценарии запланирован пробный обучающий семинар.'},
  {slug: 'onboarding-guide', title: 'Памятка для передачи задач',
    summary: 'Типовые ошибки и полезные контакты собраны в одной учебной инструкции.',
    outcome: 'В демонстрационном сценарии инструкция подготовлена для новых сотрудников.'},
];
