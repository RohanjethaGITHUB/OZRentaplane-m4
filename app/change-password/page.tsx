import ChangePasswordForm from './ChangePasswordForm'

export default function ChangePasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-open-ceiling px-6">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-2 text-2xl font-bold text-slate-900">Set your password</h1>
        <p className="mb-6 text-slate-500">Choose a new password to continue.</p>
        <ChangePasswordForm />
      </div>
    </div>
  )
}
