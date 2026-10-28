# frozen_string_literal: true

Rails.application.routes.draw do
  get  "sign_in", to: "sessions#new", as: :sign_in
  post "sign_in", to: "sessions#create"

  resources :sessions, only: [ :destroy ]
  resource :users, only: [ :destroy ]

  # Only an admin can add a user or a group -- there's no public sign-up.
  # Promoting a user to admin has no UI; it's done from `bin/rails console`.
  namespace :admin do
    resources :users, only: [ :index, :new, :create ]
    resources :groups, only: [ :new, :create ]
  end

  namespace :identity do
    resource :email_verification, only: [ :show, :create ]
    resource :password_reset,     only: [ :new, :edit, :create, :update ]
  end

  get :dashboard, to: "dashboard#index"

  resources :songs do
    resources :song_shares, only: [ :create, :destroy ]
    resource :phrasing, only: [ :show, :update ], controller: "songs/phrasings"
    member do
      patch :toggle_setlist
      get :stage
    end
  end
  get "stage", to: "songs#stage", as: :setlist_stage

  resources :groups, except: [ :new, :create ] do
    resources :memberships, only: [ :create, :destroy ]
    resources :setlists do
      resources :setlist_songs, only: [ :create, :destroy ] do
        member do
          patch :move
        end
      end
      member do
        get :stage
      end
    end
    resource :live_session, only: [ :show, :create, :update, :destroy ]
  end

  namespace :settings do
    resource :profile, only: [ :show, :update ]
    resource :password, only: [ :show, :update ]
    resource :email, only: [ :show, :update ]
    resources :sessions, only: [ :index ]
    inertia :appearance
  end

  mount ActionCable.server => "/cable"

  root "home#index"

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  get "up" => "rails/health#show", as: :rails_health_check
end
